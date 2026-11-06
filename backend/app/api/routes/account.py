from fastapi import APIRouter, status

from app.api.deps import CurrentUser
from app.services.safety.privacy import delete_all_user_data

router = APIRouter(prefix="/me", tags=["account"])


@router.delete(
    "/data",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_my_data(user: CurrentUser) -> None:
    delete_all_user_data(user)
