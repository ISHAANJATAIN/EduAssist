from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.mastery import TopicMastery
from app.models.plan import StudyPlan
from app.models.user import User

PASSWORD = "study-buddy-1"


def _auth(client: TestClient, email: str = "planner@bmu.edu.in") -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={"name": "Planner", "email": email, "password": PASSWORD},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _topic(client: TestClient, headers: dict[str, str], name: str, prerequisites=None):
    response = client.post(
        "/api/topics",
        headers=headers,
        json={"name": name, "prerequisite_ids": prerequisites or []},
    )
    assert response.status_code == 200
    return response.json()


def _set_course(
    client: TestClient,
    headers: dict[str, str],
    exam_date: date,
    free_hours: float = 2.0,
) -> None:
    response = client.put(
        "/api/course",
        headers=headers,
        json={
            "name": "Operating Systems",
            "exam_date": exam_date.isoformat(),
            "free_hours_per_day": free_hours,
        },
    )
    assert response.status_code == 200


def _user_id(email: str) -> uuid.UUID:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        return user.id


def _study_minutes(plan: dict, topic_id: str) -> int:
    return sum(
        slot["minutes"]
        for day in plan["days"]
        for slot in day["slots"]
        if slot["topic_id"] == topic_id and slot["type"] == "study"
    )


def _revision_slots(plan: dict, topic_id: str) -> list[dict]:
    return [
        {"date": day["date"], **slot}
        for day in plan["days"]
        for slot in day["slots"]
        if slot["topic_id"] == topic_id and slot["type"] == "revision"
    ]


def _first_study_date(plan: dict, topic_id: str) -> str:
    for day in plan["days"]:
        for slot in day["slots"]:
            if slot["topic_id"] == topic_id and slot["type"] == "study":
                return day["date"]
    raise AssertionError("topic has no study slot")


def test_plan_satisfies_capacity_revision_and_prerequisite_constraints(
    client: TestClient,
) -> None:
    headers = _auth(client)
    exam_date = date.today() + timedelta(days=5)
    _set_course(client, headers, exam_date)
    first = _topic(client, headers, "Processes")
    dependent = _topic(client, headers, "Deadlocks", [first["id"]])
    other = _topic(client, headers, "Memory")

    response = client.post(
        "/api/plans", headers=headers, json={"exam_date": exam_date.isoformat()}
    )

    assert response.status_code == 201
    plan = response.json()
    assert plan["feasible"] is True
    assert plan["notes"] == []
    assert [day["date"] for day in plan["days"]] == [
        (date.today() + timedelta(days=offset)).isoformat()
        for offset in range(5)
    ]
    exam_iso = exam_date.isoformat()
    assert exam_iso not in [day["date"] for day in plan["days"]]

    for day in plan["days"]:
        assert day["total_minutes"] <= 120
        assert day["total_minutes"] == sum(slot["minutes"] for slot in day["slots"])

    window_start = (exam_date - timedelta(days=3)).isoformat()
    for topic in (first, dependent, other):
        assert _study_minutes(plan, topic["id"]) >= 120
        revisions = _revision_slots(plan, topic["id"])
        assert len(revisions) == 1
        assert revisions[0]["date"] >= window_start

    assert _first_study_date(plan, first["id"]) <= _first_study_date(
        plan, dependent["id"]
    )

    latest = client.get("/api/plans/latest", headers=headers)
    assert latest.status_code == 200
    assert latest.json() == plan

    with SessionLocal() as db:
        rows = db.scalars(select(StudyPlan)).all()
        assert len(rows) == 1
        assert rows[0].id == uuid.UUID(plan["id"])


def test_prerequisite_starts_first_when_days_are_fully_booked() -> None:
    from app.services.planner.builder import DaySpec, PlanSpec, TopicRequirement
    from app.services.planner.csp import solve_plan

    start = date.today()
    for _ in range(25):
        prerequisite = uuid.uuid4()
        dependent = uuid.uuid4()
        spec = PlanSpec(
            exam_date=start + timedelta(days=4),
            free_hours_per_day=1.0,
            days=[
                DaySpec(day=start + timedelta(days=offset), minutes=60)
                for offset in range(4)
            ],
            requirements=[
                TopicRequirement(
                    topic_id=prerequisite,
                    topic_name="A",
                    weight=2,
                    study_minutes=120,
                    revision_required=False,
                    prerequisite_ids=(),
                    order=0,
                ),
                TopicRequirement(
                    topic_id=dependent,
                    topic_name="B",
                    weight=2,
                    study_minutes=120,
                    revision_required=False,
                    prerequisite_ids=(prerequisite,),
                    order=1,
                ),
            ],
            revision_day_indices=[3],
        )

        plan = solve_plan(spec).model_dump(mode="json")

        assert plan["feasible"] is True
        assert all(day["total_minutes"] == 60 for day in plan["days"])
        assert _first_study_date(plan, str(prerequisite)) <= _first_study_date(
            plan, str(dependent)
        )


def test_mastery_weight_changes_the_study_requirement(client: TestClient) -> None:
    headers = _auth(client, "weights@bmu.edu.in")
    exam_date = date.today() + timedelta(days=6)
    _set_course(client, headers, exam_date)
    weak = _topic(client, headers, "Paging")
    strong = _topic(client, headers, "Scheduling")
    user_id = _user_id("weights@bmu.edu.in")

    with SessionLocal() as db:
        db.add(
            TopicMastery(
                user_id=user_id,
                topic_id=uuid.UUID(weak["id"]),
                mastery=20.0,
                attempts=3,
                last_score=20.0,
            )
        )
        db.add(
            TopicMastery(
                user_id=user_id,
                topic_id=uuid.UUID(strong["id"]),
                mastery=90.0,
                attempts=3,
                last_score=90.0,
            )
        )
        db.commit()

    plan = client.post(
        "/api/plans", headers=headers, json={"exam_date": exam_date.isoformat()}
    ).json()

    assert plan["feasible"] is True
    assert _study_minutes(plan, weak["id"]) == 180
    assert _study_minutes(plan, strong["id"]) == 60


def test_plan_is_adjusted_when_requirements_do_not_fit(client: TestClient) -> None:
    headers = _auth(client, "tight@bmu.edu.in")
    exam_date = date.today() + timedelta(days=2)
    _set_course(client, headers, exam_date, free_hours=0.5)
    _topic(client, headers, "A")
    _topic(client, headers, "B")
    _topic(client, headers, "C")

    response = client.post(
        "/api/plans", headers=headers, json={"exam_date": exam_date.isoformat()}
    )

    assert response.status_code == 201
    plan = response.json()
    assert plan["feasible"] is False
    assert plan["notes"]
    assert all(day["total_minutes"] == 0 for day in plan["days"])


def test_overrides_remove_capacity_from_a_single_day(client: TestClient) -> None:
    headers = _auth(client, "override@bmu.edu.in")
    exam_date = date.today() + timedelta(days=3)
    _set_course(client, headers, exam_date)
    _topic(client, headers, "Interrupts")
    blocked = (date.today() + timedelta(days=1)).isoformat()

    plan = client.post(
        "/api/plans",
        headers=headers,
        json={"exam_date": exam_date.isoformat(), "overrides": {blocked: 0}},
    ).json()

    assert plan["feasible"] is True
    day = next(day for day in plan["days"] if day["date"] == blocked)
    assert day["total_minutes"] == 0
    assert day["slots"] == []


def test_plan_requires_an_exam_date_and_topics(client: TestClient) -> None:
    headers = _auth(client, "missing@bmu.edu.in")

    missing_date = client.post("/api/plans", headers=headers, json={})
    assert missing_date.status_code == 422
    assert missing_date.json()["code"] == "validation_error"

    exam_date = date.today() + timedelta(days=3)
    _set_course(client, headers, exam_date)
    no_topics = client.post(
        "/api/plans", headers=headers, json={"exam_date": exam_date.isoformat()}
    )
    assert no_topics.status_code == 409
    assert no_topics.json()["code"] == "no_material"


def test_plan_rejects_a_past_exam_date_and_foreign_topics(client: TestClient) -> None:
    headers = _auth(client, "invalid@bmu.edu.in")
    past = client.post(
        "/api/plans",
        headers=headers,
        json={"exam_date": (date.today() - timedelta(days=1)).isoformat()},
    )
    assert past.status_code == 422

    other_headers = _auth(client, "invalid2@bmu.edu.in")
    foreign = _topic(client, other_headers, "Foreign")
    own = _topic(client, headers, "Own")
    exam_date = date.today() + timedelta(days=3)
    response = client.post(
        "/api/plans",
        headers=headers,
        json={
            "exam_date": exam_date.isoformat(),
            "topic_ids": [own["id"], foreign["id"]],
        },
    )
    assert response.status_code == 422


def test_plan_rejects_out_of_range_overrides(client: TestClient) -> None:
    headers = _auth(client, "badoverride@bmu.edu.in")
    exam_date = date.today() + timedelta(days=3)
    _topic(client, headers, "Threads")

    past = client.post(
        "/api/plans",
        headers=headers,
        json={
            "exam_date": exam_date.isoformat(),
            "overrides": {(date.today() - timedelta(days=1)).isoformat(): 1},
        },
    )
    assert past.status_code == 422

    on_exam = client.post(
        "/api/plans",
        headers=headers,
        json={
            "exam_date": exam_date.isoformat(),
            "overrides": {exam_date.isoformat(): 1},
        },
    )
    assert on_exam.status_code == 422


def test_latest_plan_is_scoped_to_the_user(client: TestClient) -> None:
    headers = _auth(client, "latest@bmu.edu.in")
    assert (
        client.get("/api/plans/latest", headers=headers).status_code == 404
    )

    exam_date = date.today() + timedelta(days=4)
    _topic(client, headers, "Files")
    plan = client.post(
        "/api/plans", headers=headers, json={"exam_date": exam_date.isoformat()}
    ).json()

    other = _auth(client, "latest2@bmu.edu.in")
    assert client.get("/api/plans/latest", headers=other).status_code == 404
    assert client.get("/api/plans/latest", headers=headers).json()["id"] == plan["id"]


def test_planner_chat_uses_course_settings(client: TestClient) -> None:
    headers = _auth(client, "plannerchat@bmu.edu.in")
    exam_date = date.today() + timedelta(days=4)
    _set_course(client, headers, exam_date)
    _topic(client, headers, "Virtual memory")

    response = client.post(
        "/api/chat",
        headers=headers,
        json={"message": "Plan my revision", "intent": "planner"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "planner"
    assert body["reply"]["type"] == "plan"
    assert body["reply"]["plan"]["exam_date"] == exam_date.isoformat()

    rows = client.get("/api/chat/history", headers=headers).json()
    assert [row["role"] for row in rows] == ["user", "assistant"]
    assert rows[0]["intent"] == "planner"
    assert rows[1]["reply"] == body["reply"]
