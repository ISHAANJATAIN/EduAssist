from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.performance import PerformanceOut, RecommendationOut
from app.services.recommender.rules import recommendations_for
from app.services.tracking.mastery import performance_for

router = APIRouter(tags=["performance"])


@router.get("/performance", response_model=PerformanceOut)
def read_performance(user: CurrentUser, db: DbSession) -> PerformanceOut:
    return performance_for(db, user)


@router.get("/recommendations", response_model=list[RecommendationOut])
def read_recommendations(
    user: CurrentUser, db: DbSession
) -> list[RecommendationOut]:
    return recommendations_for(db, user)
