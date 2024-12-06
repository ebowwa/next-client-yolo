from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import json

from .models import Detection, Base
from .database import engine, get_db
from pydantic import BaseModel, Field

# Create tables
Base.metadata.drop_all(bind=engine)  # Drop existing tables
Base.metadata.create_all(bind=engine)  # Create new tables

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float

class ObjectInfo(BaseModel):
    class_name: str = Field(..., alias='class')
    bbox: List[float]

class DetectionCreate(BaseModel):
    object_class: str
    confidence: float
    bbox: BoundingBox
    objects: Optional[List[ObjectInfo]] = None
    gemini_analysis: str

    class Config:
        allow_population_by_field_name = True

@app.post("/detections/", response_model=DetectionCreate)
async def create_detection(detection: DetectionCreate, db: Session = Depends(get_db)):
    try:
        db_detection = Detection(
            object_class=detection.object_class,
            confidence=detection.confidence,
            bbox=detection.bbox.dict(),
            objects=[obj.dict(by_alias=True) for obj in detection.objects] if detection.objects else None,
            gemini_analysis=detection.gemini_analysis
        )
        db.add(db_detection)
        db.commit()
        db.refresh(db_detection)
        return detection
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/detections/", response_model=List[DetectionCreate])
async def get_detections(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    try:
        detections = db.query(Detection).offset(skip).limit(limit).all()
        return [
            DetectionCreate(
                object_class=d.object_class,
                confidence=d.confidence,
                bbox=BoundingBox(**d.bbox),
                objects=[ObjectInfo(**obj) for obj in d.objects] if d.objects else None,
                gemini_analysis=d.gemini_analysis
            )
            for d in detections
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/detections/{detection_id}/analysis")
async def update_gemini_analysis(detection_id: int, analysis: str, db: Session = Depends(get_db)):
    detection = db.query(Detection).filter(Detection.id == detection_id).first()
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    
    detection.gemini_analysis = analysis
    db.commit()
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
