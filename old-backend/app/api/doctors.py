from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.doctor import Doctor
from app.models.user import User
from app.schemas.doctor import (
    DoctorProfileCreate,
    DoctorProfileResponse
)
from app.core.dependencies import require_role


router = APIRouter(
    prefix="/api/doctors",
    tags=["Doctors"]
)


@router.post(
    "/profile",
    response_model=DoctorProfileResponse,
    status_code=status.HTTP_201_CREATED
)
def create_doctor_profile(
    data: DoctorProfileCreate,
    current_user: User = Depends(
        require_role("doctor")
    ),
    db: Session = Depends(get_db)
):
    existing_profile = (
        db.query(Doctor)
        .filter(Doctor.user_id == current_user.id)
        .first()
    )

    if existing_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Doctor profile already exists"
        )

    doctor = Doctor(
        user_id=current_user.id,
        specialization=data.specialization,
        qualification=data.qualification,
        experience_years=data.experience_years,
        license_number=data.license_number,
        consultation_fee=data.consultation_fee
    )

    db.add(doctor)
    db.commit()
    db.refresh(doctor)

    return doctor


@router.get(
    "/me",
    response_model=DoctorProfileResponse
)
def get_my_doctor_profile(
    current_user: User = Depends(
        require_role("doctor")
    ),
    db: Session = Depends(get_db)
):
    doctor = (
        db.query(Doctor)
        .filter(Doctor.user_id == current_user.id)
        .first()
    )

    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found"
        )

    return doctor