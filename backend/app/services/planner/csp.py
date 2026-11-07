from __future__ import annotations

import math
import uuid
from collections import defaultdict
from dataclasses import replace
from time import monotonic

from constraint import BacktrackingSolver, Constraint, Problem
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models.plan import StudyPlan
from app.models.user import User
from app.schemas.planner import PlanDayOut, PlanIn, PlanOut, PlanSlotOut
from app.services.planner.builder import (
    BLOCK_MINUTES,
    PlanSpec,
    TopicRequirement,
    build_spec,
)

MAX_RELAXATION_STEPS = 5
MAX_SEARCH_CHECKS = 50_000
MAX_SEARCH_SECONDS = 2.0
BLOCK_LABEL = f"{BLOCK_MINUTES}-minute"


class _SearchBudget:
    def __init__(self) -> None:
        self.remaining = MAX_SEARCH_CHECKS
        self.deadline = monotonic() + MAX_SEARCH_SECONDS

    def check(self) -> None:
        self.remaining -= 1
        if self.remaining < 0 or monotonic() >= self.deadline:
            raise AppError(
                "planning_limit",
                "Planning search limit reached; try fewer topics or a shorter date range. "
                "Feasibility has not been determined.",
                503,
            )


class DailyCapacity(Constraint):
    def __init__(self, capacity: dict[int, int], budget: _SearchBudget) -> None:
        self.capacity = capacity
        self.budget = budget

    def __call__(self, variables, domains, assignments, forwardcheck=False) -> bool:
        self.budget.check()
        totals: dict[int, int] = defaultdict(int)
        for name in variables:
            if name in assignments:
                totals[assignments[name]] += BLOCK_MINUTES
        for day, total in totals.items():
            if total > self.capacity.get(day, 0):
                return False
        for name in variables:
            if name in assignments:
                continue
            if not any(
                totals[day] + BLOCK_MINUTES <= self.capacity.get(day, 0)
                for day in domains[name]
            ):
                return False
        return True


class FirstDayOrder(Constraint):
    def __init__(self, earlier: str, later: str) -> None:
        self.earlier = earlier
        self.later = later

    def __call__(self, variables, domains, assignments, forwardcheck=False) -> bool:
        if self.earlier in assignments and self.later in assignments:
            return assignments[self.earlier] <= assignments[self.later]
        return True


def _slot_key(requirement: TopicRequirement) -> tuple[int, int, str]:
    return (requirement.order, -requirement.weight, requirement.topic_name.casefold())


def _solve_once(
    spec: PlanSpec, requirements: list[TopicRequirement], budget: _SearchBudget
) -> dict[str, int] | None:
    budget.check()
    if not spec.days or not requirements:
        return None
    if (
        any(requirement.revision_required for requirement in requirements)
        and not spec.revision_day_indices
    ):
        return None

    day_count = len(spec.days)
    capacity = {
        index: (day.minutes // BLOCK_MINUTES) * BLOCK_MINUTES
        for index, day in enumerate(spec.days)
    }

    all_vars: list[str] = []
    study_vars: dict[uuid.UUID, list[str]] = {}
    for requirement in requirements:
        blocks = max(1, math.ceil(requirement.study_minutes / BLOCK_MINUTES))
        names = [
            f"study:{requirement.topic_id}:{index}" for index in range(blocks)
        ]
        study_vars[requirement.topic_id] = names
        all_vars.extend(names)
        if requirement.revision_required:
            all_vars.append(f"revision:{requirement.topic_id}")

    if len(all_vars) * BLOCK_MINUTES > sum(capacity.values()):
        return None

    problem = Problem(BacktrackingSolver(forwardcheck=True))
    for name in all_vars:
        if name.startswith("revision:"):
            problem.addVariable(name, list(spec.revision_day_indices))
        else:
            problem.addVariable(name, list(range(day_count)))

    problem.addConstraint(DailyCapacity(capacity, budget), all_vars)
    for names in study_vars.values():
        for earlier, later in zip(names, names[1:]):
            problem.addConstraint(FirstDayOrder(earlier, later))
    for requirement in requirements:
        later = study_vars[requirement.topic_id][0]
        for prerequisite_id in requirement.prerequisite_ids:
            earlier = study_vars.get(prerequisite_id)
            if earlier is not None:
                problem.addConstraint(FirstDayOrder(earlier[0], later))

    return problem.getSolution()


def _relax(
    requirements: list[TopicRequirement], step: int
) -> tuple[list[TopicRequirement], str | None]:
    relaxed: list[TopicRequirement] = []
    changed = False
    note: str | None = None

    for requirement in requirements:
        updated = requirement
        if step == 0 and requirement.weight == 1 and requirement.revision_required:
            updated = replace(requirement, revision_required=False)
            note = (
                "Dropped revision sessions for strong topics so the "
                "study blocks fit."
            )
        elif step == 1 and requirement.weight == 2 and requirement.revision_required:
            updated = replace(requirement, revision_required=False)
            note = (
                "Dropped revision sessions for developing and untested "
                "topics so the study blocks fit."
            )
        elif (
            step == 2
            and requirement.weight == 1
            and requirement.study_minutes > BLOCK_MINUTES
        ):
            updated = replace(requirement, study_minutes=BLOCK_MINUTES)
            note = (
                f"Reduced strong topics to a single {BLOCK_LABEL} study block."
            )
        elif (
            step == 3
            and requirement.weight == 2
            and requirement.study_minutes > BLOCK_MINUTES
        ):
            updated = replace(requirement, study_minutes=BLOCK_MINUTES)
            note = (
                "Reduced developing and untested topics to a single "
                f"{BLOCK_LABEL} study block."
            )
        elif step == 4 and (
            requirement.study_minutes > BLOCK_MINUTES
            or requirement.revision_required
        ):
            updated = replace(
                requirement,
                study_minutes=min(requirement.study_minutes, BLOCK_MINUTES),
                revision_required=False,
            )
            note = (
                "Reduced weak topics to a single "
                f"{BLOCK_LABEL} study block and dropped any remaining "
                "revision sessions."
            )

        if updated is not requirement:
            changed = True
        relaxed.append(updated)

    return relaxed, note if changed else None


def _empty_plan(spec: PlanSpec, notes: list[str]) -> PlanOut:
    return PlanOut(
        id=uuid.uuid4(),
        exam_date=spec.exam_date,
        feasible=False,
        days=[
            PlanDayOut(date=day.day, total_minutes=0, slots=[])
            for day in spec.days
        ],
        notes=notes,
    )


def _to_plan(
    spec: PlanSpec,
    requirements: list[TopicRequirement],
    solution: dict[str, int],
    notes: list[str],
) -> PlanOut:
    by_id = {requirement.topic_id: requirement for requirement in requirements}
    study: dict[tuple[int, uuid.UUID], int] = defaultdict(int)
    revision: dict[uuid.UUID, int] = {}

    for name, day in solution.items():
        kind, raw_id, *_ = name.split(":")
        topic_id = uuid.UUID(raw_id)
        if kind == "study":
            study[(day, topic_id)] += BLOCK_MINUTES
        else:
            revision[topic_id] = day

    days: list[PlanDayOut] = []
    for index, day_spec in enumerate(spec.days):
        study_entries = sorted(
            (
                (by_id[topic_id], minutes)
                for (day, topic_id), minutes in study.items()
                if day == index
            ),
            key=lambda item: _slot_key(item[0]),
        )
        revision_entries = sorted(
            (
                (by_id[topic_id], BLOCK_MINUTES)
                for topic_id, day in revision.items()
                if day == index
            ),
            key=lambda item: _slot_key(item[0]),
        )
        slots = [
            PlanSlotOut(
                topic_id=requirement.topic_id,
                topic_name=requirement.topic_name,
                minutes=minutes,
                type="study",
            )
            for requirement, minutes in study_entries
        ] + [
            PlanSlotOut(
                topic_id=requirement.topic_id,
                topic_name=requirement.topic_name,
                minutes=minutes,
                type="revision",
            )
            for requirement, minutes in revision_entries
        ]
        days.append(
            PlanDayOut(
                date=day_spec.day,
                total_minutes=sum(slot.minutes for slot in slots),
                slots=slots,
            )
        )

    return PlanOut(
        id=uuid.uuid4(),
        exam_date=spec.exam_date,
        feasible=not notes,
        days=days,
        notes=notes,
    )


def solve_plan(spec: PlanSpec) -> PlanOut:
    if not spec.days:
        return _empty_plan(
            spec,
            notes=[
                "The exam is today, so there is no time left to schedule study."
            ],
        )

    requirements = list(spec.requirements)
    notes: list[str] = []
    budget = _SearchBudget()
    for step in range(MAX_RELAXATION_STEPS + 1):
        solution = _solve_once(spec, requirements, budget)
        if solution is not None:
            return _to_plan(spec, requirements, solution, notes)
        if step == MAX_RELAXATION_STEPS:
            break
        requirements, note = _relax(requirements, step)
        if note is not None:
            notes.append(note)

    return _empty_plan(
        spec,
        notes=notes
        + [
            f"Even one {BLOCK_LABEL} block per topic does not fit in the "
            "available time."
        ],
    )


def create_plan(db: Session, user: User, payload: PlanIn) -> PlanOut:
    user_id = user.id
    db.scalar(select(User).where(User.id == user_id).with_for_update())
    db.expire_all()
    spec = build_spec(db, user, payload)
    plan = solve_plan(spec)
    db.add(
        StudyPlan(
            id=plan.id,
            user_id=user.id,
            exam_date=spec.exam_date,
            free_hours_per_day=spec.free_hours_per_day,
            feasible=plan.feasible,
            plan=plan.model_dump(mode="json"),
        )
    )
    db.flush()
    return plan


def latest_plan(db: Session, user: User) -> PlanOut:
    row = db.scalar(
        select(StudyPlan)
        .where(StudyPlan.user_id == user.id)
        .order_by(StudyPlan.created_at.desc())
        .limit(1)
    )
    if row is None:
        raise AppError("not_found", "No study plan has been created yet.", 404)
    return PlanOut.model_validate(row.plan)
