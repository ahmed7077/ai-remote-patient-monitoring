import type {Alert,DemoScenario,Device,Patient,PatientCreate,Risk,Role,Session,TokenResponse,User} from './types';
const BASE=import.meta.env.VITE_API_URL??'http://localhost:8000/api/v1';
let accessToken=localStorage.getItem('access_token');
export class ApiError extends Error{constructor(public status:number,message:string){super(message)}}
async function request<T>(path:string,options:RequestInit={}):Promise<T>{
 const response=await fetch(`${BASE}${path}`,{...options,headers:{'Content-Type':'application/json',...(accessToken?{Authorization:`Bearer ${accessToken}`} :{}),...options.headers}});
 if(!response.ok){let message='Unable to complete this request.';try{const body=await response.json();message=body.detail??message}catch{/* response was not JSON */}throw new ApiError(response.status,message)}
 return response.status===204?undefined as T:response.json();
}
export const api={
 login:async(email:string,password:string)=>{const tokens=await request<TokenResponse>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});accessToken=tokens.access_token;localStorage.setItem('access_token',tokens.access_token);localStorage.setItem('refresh_token',tokens.refresh_token);return tokens},
 register:(data:{full_name:string;email:string;password:string;role:Role})=>request<User>('/auth/register',{method:'POST',body:JSON.stringify(data)}),
 me:()=>request<User>('/auth/me'),patients:()=>request<Patient[]>('/patients'),createPatient:(data:PatientCreate)=>request<Patient>('/patients',{method:'POST',body:JSON.stringify(data)}),simulate:(id:string,scenario:DemoScenario)=>request<Session>(`/patients/${id}/demo/simulate`,{method:'POST',body:JSON.stringify({scenario})}),devices:(id:string)=>request<Device[]>(`/patients/${id}/devices`),sessions:(id:string)=>request<Session[]>(`/patients/${id}/sessions`),risks:(id:string)=>request<Risk[]>(`/patients/${id}/risks`),alerts:(id:string)=>request<Alert[]>(`/patients/${id}/alerts`),acknowledge:(id:string)=>request<Alert>(`/alerts/${id}/acknowledge`,{method:'POST'}),
 logout:()=>{accessToken=null;localStorage.removeItem('access_token');localStorage.removeItem('refresh_token')},hasToken:()=>Boolean(accessToken)
};
