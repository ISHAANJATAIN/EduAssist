import uuid
from datetime import date
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.schemas.common import ORMModel

CourseName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]


class CourseOut(ORMModel):
    id: uuid.UUID
    name: str
    exam_date: date | None
    free_hours_per_day: float


class CourseUpdate(BaseModel):
    name: CourseName
    exam_date: date | None = None
    free_hours_per_day: float = Field(ge=0, le=24)
