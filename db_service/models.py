from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class Detection(Base):
    __tablename__ = "detections"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    object_class = Column(String)  # Will be 'scene' for scene analysis
    confidence = Column(Float)
    bbox = Column(JSON)  # Store scene dimensions
    objects = Column(JSON)  # Store list of objects in the scene
    gemini_analysis = Column(String)
    
    class Config:
        orm_mode = True
