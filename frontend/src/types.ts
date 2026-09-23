export type Role='PATIENT'|'HEALTHCARE_PROFESSIONAL'; export type RiskLevel='NORMAL'|'WARNING'|'HIGH_RISK';
export interface User{id:string;full_name:string;email:string;role:Role;is_active:boolean}
export interface Patient{id:string;patient_code:string;display_name:string;linked_user_id:string|null;created_at:string}
export interface Device{id:string;device_uid:string;patient_id:string;device_type:'SIMULATOR'|'ESP32';status:'ONLINE'|'OFFLINE'|'STALE';last_seen_at:string|null;firmware_version:string|null}
export interface Vital{vital_type:'HEART_RATE'|'SPO2'|'SYSTOLIC_BP'|'DIASTOLIC_BP'|'TEMPERATURE';value:number;unit:string;quality_status:'VALID'|'SUSPECT'|'INVALID'}
export interface Session{id:string;patient_id:string;device_id:string;recorded_at:string;received_at:string;source:string;measurements:Vital[]}
export interface Risk{id:string;patient_id:string;session_id:string;risk_level:RiskLevel;assessment_method:string;explanation:string;created_at:string}
export interface Alert{id:string;patient_id:string;session_id:string;severity:RiskLevel;message:string;acknowledged:boolean;acknowledged_by:string|null;acknowledged_at:string|null;created_at:string}
