from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.appointment import Appointment
from app.models.doctor import Doctor
from app.models.patient import Patient
from app.models.user import User
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentResponse
)
from app.core.dependencies import require_role


router = APIRouter(
    prefix="/api/appointments",
    tags=["Appointments"]
)


# ============================================================
# PATIENT - CREATE APPOINTMENT
# ============================================================

@router.post(
    "/",
    response_model=AppointmentResponse,
    status_code=status.HTTP_201_CREATED
)
def create_appointment(
    data: AppointmentCreate,
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

    doctor = (
        db.query(Doctor)
        .filter(Doctor.id == data.doctor_id)
        .first()
    )

    if not doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor not found"
        )

    appointment = Appointment(
        patient_id=patient.id,
        doctor_id=doctor.id,
        appointment_date=data.appointment_date,
        reason=data.reason,
        status="pending"
    )

    db.add(appointment)
    db.commit()
    db.refresh(appointment)

    return appointment


# ============================================================
# PATIENT - VIEW APPOINTMENTS
# ============================================================

@router.get(
    "/patient",
    response_model=list[AppointmentResponse]
)
def get_patient_appointments(
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

    return (
        db.query(Appointment)
        .filter(
            Appointment.patient_id == patient.id
        )
        .order_by(Appointment.appointment_date.desc())
        .all()
    )


# ============================================================
# DOCTOR - VIEW APPOINTMENTS
# ============================================================

@router.get(
    "/doctor",
    response_model=list[AppointmentResponse]
)
def get_doctor_appointments(
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

    return (
        db.query(Appointment)
        .filter(
            Appointment.doctor_id == doctor.id
        )
        .order_by(Appointment.appointment_date.desc())
        .all()
    )


# ============================================================
# DOCTOR - ACCEPT APPOINTMENT
# ============================================================

@router.post(
    "/{appointment_id}/accept",
    response_model=AppointmentResponse
)
def accept_appointment(
    appointment_id: int,
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

    appointment = (
        db.query(Appointment)
        .filter(
            Appointment.id == appointment_id,
            Appointment.doctor_id == doctor.id
        )
        .first()
    )

    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found"
        )

    if appointment.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Appointment cannot be accepted because its current status is '{appointment.status}'"
        )

    appointment.status = "confirmed"

    db.commit()
    db.refresh(appointment)

    return appointment


# ============================================================
# DOCTOR - REJECT APPOINTMENT
# ============================================================

@router.post(
    "/{appointment_id}/reject",
    response_model=AppointmentResponse
)
def reject_appointment(
    appointment_id: int,
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

    appointment = (
        db.query(Appointment)
        .filter(
            Appointment.id == appointment_id,
            Appointment.doctor_id == doctor.id
        )
        .first()
    )

    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found"
        )

    if appointment.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Appointment cannot be rejected because its current status is '{appointment.status}'"
        )

    appointment.status = "rejected"

    db.commit()
    db.refresh(appointment)

    return appointment


# ============================================================
# PATIENT - CANCEL APPOINTMENT
# ============================================================

@router.post(
    "/{appointment_id}/cancel",
    response_model=AppointmentResponse
)
def cancel_appointment(
    appointment_id: int,
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

    appointment = (
        db.query(Appointment)
        .filter(
            Appointment.id == appointment_id,
            Appointment.patient_id == patient.id
        )
        .first()
    )

    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found"
        )

    if appointment.status not in ["pending", "confirmed"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Appointment cannot be cancelled because its current status is '{appointment.status}'"
        )

    appointment.status = "cancelled"

    db.commit()
    db.refresh(appointment)

    return appointment