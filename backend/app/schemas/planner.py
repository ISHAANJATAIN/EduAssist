import uuid
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field

SlotType = Literal["study", "revision"]
DayHours = Annotated[float, Field(ge=0, le=24)]


class PlanIn(BaseModel):
    exam_date: date | None = None
    free_hours_per_day: DayHours | None = None
    overrides: dict[date, DayHours] | None = None
    topic_ids: list[uuid.UUID] | None = None


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
