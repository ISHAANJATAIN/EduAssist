import uuid
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

MAX_PLANNER_DAYS = 365
MAX_PLANNER_TOPICS = 100

SlotType = Literal["study", "revision"]
DayHours = Annotated[float, Field(ge=0, le=24)]


class PlanIn(BaseModel):
    exam_date: date | None = None
    free_hours_per_day: DayHours | None = None
    overrides: dict[date, DayHours] | None = None
    topic_ids: list[uuid.UUID] | None = Field(default=None, max_length=MAX_PLANNER_TOPICS)

    @field_validator("exam_date")
    @classmethod
    def bounded_horizon(cls, value: date | None) -> date | None:
        if value is not None and (value - date.today()).days > MAX_PLANNER_DAYS:
            raise ValueError(f"Plan at most {MAX_PLANNER_DAYS} days ahead.")
        return value


class PlanSlotOut(BaseModel):
    topic_id: uuid.UUID
    topic_name: str
    minutes: int
    type: SlotType


class PlanDayOut(BaseModel):
    date: date
    total_minutes: int
    slots: list[PlanSlotOut]


class PlanOut(BaseModel):
    id: uuid.UUID
    exam_date: date
    feasible: bool
    days: list[PlanDayOut]
    notes: list[str] = Field(default_factory=list)
