# AI-Powered Remote Patient Monitoring

An AI-powered Remote Patient Monitoring (RPM) platform that combines
IoT-based physiological sensing, machine learning, predictive healthcare
analytics, and secure data management for continuous patient monitoring.

## Overview

Traditional healthcare monitoring often relies on periodic clinical visits
and manual measurements, which may not provide continuous visibility into a
patient's physiological condition.

This project proposes an intelligent Remote Patient Monitoring platform
capable of continuously collecting multiple physiological parameters,
analyzing real-time and historical trends, identifying abnormal patterns,
performing ML-based risk assessment, and providing timely alerts through
patient and healthcare-professional dashboards.

> This project is intended as a monitoring and decision-support prototype
> and is not intended to provide medical diagnosis or replace professional
> clinical judgment.

## Physiological Parameters

The proposed system monitors:

- Heart Rate
- SpO₂
- Blood Pressure
- Body Temperature

## Key Features

- Real-time vital-sign monitoring
- IoT-based physiological data acquisition
- Historical health trend visualization
- Data preprocessing and feature engineering
- Machine-learning-based anomaly detection
- Predictive risk assessment
- Normal / Warning / High Risk classification
- Automated alerts
- Patient dashboard
- Healthcare-professional dashboard
- Authentication and Role-Based Access Control (RBAC)
- Secure API communication

## Proposed Architecture

          Patient  
              ↓  
        IoT Sensors  
              ↓  
      ESP32 / IoT Gateway  
              ↓  
      Secure REST API  
              ↓  
      Backend & Database  
              ↓  
    Data Preprocessing & Feature Engineering  
              ↓  
        AI / ML Engine  
              ↓  
        Risk Assessment  
              ↓  
      Dashboard & Alerts  
              ↓  
    Patient / Healthcare Professional

## Proposed Hardware

- ESP32 Development Board
- MAX30102 Heart Rate & SpO₂ Sensor
- Temperature Sensor
- Blood Pressure Monitoring Device
- Wi-Fi connectivity
- Development computer/server

## Proposed Software

- Python
- Scikit-learn
- XGBoost
- FastAPI / Flask
- MySQL / PostgreSQL
- Arduino IDE
- HTML, CSS and JavaScript / React
- REST APIs
- Git & GitHub

## Machine Learning

Candidate machine-learning models will be experimentally compared for
physiological risk assessment.

Planned models include:

- Logistic Regression
- Support Vector Machine (SVM)
- Random Forest
- XGBoost

Evaluation metrics will include:

- Accuracy
- Precision
- Recall
- F1-Score
- ROC-AUC

Experimental results will be added after model development and evaluation.

## Team

| Name | USN |
|---|---|
| Ayush Kumar Pandey | 20231ISE0057 |
| Ansit Pradhan | 20232ISE0058 |
| Muhammad Ahmed | 20231ISE0061 |

## Project Status

Development in Progress

Current phase:
- Literature review
- Requirements analysis
- System architecture design
- Dataset and ML methodology planning

## Disclaimer

This project is an academic prototype developed for remote patient
monitoring and predictive healthcare analytics. It is not a certified
medical device and should not be used for medical diagnosis or clinical
decision-making without appropriate professional validation.
