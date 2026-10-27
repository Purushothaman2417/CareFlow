from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.dependencies import get_current_user
from app.core.cache import get_user_cache, set_user_cache

from app.database import get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse
)
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password
)

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)


@router.post(
    "/register",
    response_model=TokenResponse
)
def register(
    data: RegisterRequest,
    db: Session = Depends(get_db)
):
    existing_user = (
        db.query(User)
        .filter(User.email == data.email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password)
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({
        "sub": str(user.id),
        "email": user.email
    })

    return {
        "access_token": token,
        "token_type": "bearer"
    }


@router.post(
    "/login",
    response_model=TokenResponse
)
def login(
    data: LoginRequest,
    db: Session = Depends(get_db)
):
    user = (
        db.query(User)
        .filter(User.email == data.email)
        .first()
    )

    if not user or not verify_password(
        data.password,
        user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    token = create_access_token({
    "sub": str(user.id),
    "email": user.email,
    "role": user.role
})

    return {
        "access_token": token,
        "token_type": "bearer"
    }
@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user)
):
    cached_user = get_user_cache(current_user.id)

    if cached_user:
        return {
            "source": "redis",
            "user": cached_user
        }

    user_data = {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "is_active": current_user.is_active
    }

    set_user_cache(
        current_user.id,
        user_data
    )

    return {
        "source": "postgresql",
        "user": user_data
    }
from app.core.dependencies import (
    get_current_user,
    require_role
)
@router.get("/patient-only")
def patient_only(
    current_user: User = Depends(
        require_role("patient")
    )
):
    return {
        "message": "Welcome patient",
        "user_id": current_user.id,
        "role": current_user.role
    }
@router.get("/doctor-only")
def doctor_only(
    current_user: User = Depends(
        require_role("doctor")
    )
):
    return {
        "message": "Welcome doctor",
        "user_id": current_user.id,
        "role": current_user.role
    }