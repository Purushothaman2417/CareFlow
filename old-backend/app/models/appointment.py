from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)

    patient_id = Column(
        Integer,
        ForeignKey("patients.id"),
        nullable=False
    )

    doctor_id = Column(
        Integer,
        ForeignKey("doctors.id"),
        nullable=False
    )

    appointment_date = Column(
        DateTime,
        nullable=False
    )

    reason = Column(
        String(500),
        nullable=True
    )

    status = Column(
        String(20),
        nullable=False,
        default="pending"
    )

    patient = relationship("Patient")
    doctor = relationship("Doctor")