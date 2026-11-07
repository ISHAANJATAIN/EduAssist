from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.planner import PlanIn, PlanOut
from app.services.planner.csp import create_plan, latest_plan

router = APIRouter(prefix="/plans", tags=["planner"])


@router.post("", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
def build_plan(payload: PlanIn, db: DbSession, user: CurrentUser) -> PlanOut:
    try:
        result = create_plan(db, user, payload)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


@router.get("/latest", response_model=PlanOut)
def read_latest_plan(db: DbSession, user: CurrentUser) -> PlanOut:
    return latest_plan(db, user)
