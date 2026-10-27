from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.patient import Patient
from app.models.user import User
from app.schemas.patient import (
    PatientProfileCreate,
    PatientProfileResponse
)
from app.core.dependencies import require_role


router = APIRouter(
    prefix="/api/patients",
    tags=["Patients"]
)


@router.post(
    "/profile",
    response_model=PatientProfileResponse,
    status_code=status.HTTP_201_CREATED
)
def create_patient_profile(
    data: PatientProfileCreate,
    current_user: User = Depends(
        require_role("patient")
    ),
    db: Session = Depends(get_db)
):
    existing_profile = (
        db.query(Patient)
        .filter(Patient.user_id == current_user.id)
        .first()
    )

    if existing_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Patient profile already exists"
        )

    patient = Patient(
        user_id=current_user.id,
        date_of_birth=data.date_of_birth,
        gender=data.gender,
        phone=data.phone,
        address=data.address,
        blood_group=data.blood_group,
        emergency_contact_name=data.emergency_contact_name,
        emergency_contact_phone=data.emergency_contact_phone
    )

    db.add(patient)
    db.commit()
    db.refresh(patient)

    return patient


@router.get(
    "/me",
    response_model=PatientProfileResponse
)
def get_my_patient_profile(
    current_user: User = Depends(
        require_role("patient")
    ),
    db: Session = Depends(get_db)
):
    patient = (
        db.query(Patient)
        .filter(Patient.user_id == current_user.id)
        .first()
    )

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile not found"
        )

    return patient