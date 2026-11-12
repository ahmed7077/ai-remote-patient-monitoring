import type {Alert,CareEntry,CareInput,DemoScenario,Device,DeviceCreate,DeviceRegistration,MLModel,MLPrediction,Patient,PatientCreate,Risk,Role,Session,TokenResponse,User} from './types';
const BASE=import.meta.env.VITE_API_URL??'http://localhost:8000/api/v1';
let accessToken=localStorage.getItem('access_token');
export class ApiError extends Error{constructor(public status:number,message:string){super(message)}}
let lastRefreshedFrom: string | null = null
let lastRefreshedAccess: string | null = null
let refreshing: Promise<boolean> | undefined
function refreshSession(): Promise<boolean> {
 if(refreshing) return refreshing
 const refreshToken=localStorage.getItem('refresh_token')
 if(!refreshToken) return Promise.resolve(false)
 refreshing=(async()=>{
  try{
   const response=await fetch(`${BASE}/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:refreshToken})})
   if(!response.ok) return false
   const tokens:TokenResponse=await response.json()
   if(localStorage.getItem('refresh_token')!==refreshToken) return false
   lastRefreshedFrom=accessToken
   accessToken=tokens.access_token
   lastRefreshedAccess=accessToken
   localStorage.setItem('access_token',tokens.access_token)
   localStorage.setItem('refresh_token',tokens.refresh_token)
   return true
  }catch{return false}
 })().finally(()=>{refreshing=undefined})
 return refreshing
}
async function request<T>(path:string,options:RequestInit={}):Promise<T>{
 const send=(token:string|null)=>fetch(`${BASE}${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...options.headers}})
 const token=accessToken
 const refreshToken=localStorage.getItem('refresh_token')
 let response=await send(token)
 const protectedRequest=path!=='/auth/login' && path!=='/auth/register'
 if(response.status===401 && token && protectedRequest){
  if(accessToken===token && localStorage.getItem('refresh_token')===refreshToken){
   if(await refreshSession()) response=await send(accessToken)
  }else if(refreshToken && accessToken && accessToken!==token){
   // A concurrent request may already have renewed this session.
   if(lastRefreshedAccess===accessToken && lastRefreshedFrom===token) response=await send(accessToken)
  }
 }
 if(!response.ok){
  let message='Unable to complete this request.'
  try{const body=await response.json();if(typeof body.detail==='string')message=body.detail}catch{/* response was not JSON */}
  if(response.status===401 && protectedRequest) message='Your session ended. Copy any unsaved text, then sign in again.'
  throw new ApiError(response.status,message)
 }
 return response.status===204?undefined as T:response.json();
}
export const api={
 login:async(email:string,password:string)=>{const tokens=await request<TokenResponse>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});accessToken=tokens.access_token;localStorage.setItem('access_token',tokens.access_token);localStorage.setItem('refresh_token',tokens.refresh_token);return tokens},
 register:(data:{full_name:string;email:string;password:string;role:Role})=>request<User>('/auth/register',{method:'POST',body:JSON.stringify(data)}),
 me:()=>request<User>('/auth/me'),patients:()=>request<Patient[]>('/patients'),createPatient:(data:PatientCreate)=>request<Patient>('/patients',{method:'POST',body:JSON.stringify(data)}),registerDevice:(data:DeviceCreate)=>request<DeviceRegistration>('/devices',{method:'POST',body:JSON.stringify(data)}),simulate:(id:string,scenario:DemoScenario)=>request<Session>(`/patients/${id}/demo/simulate`,{method:'POST',body:JSON.stringify({scenario})}),devices:(id:string)=>request<Device[]>(`/patients/${id}/devices`),sessions:(id:string)=>request<Session[]>(`/patients/${id}/sessions`),risks:(id:string)=>request<Risk[]>(`/patients/${id}/risks`),alerts:(id:string)=>request<Alert[]>(`/patients/${id}/alerts`),acknowledge:(id:string)=>request<Alert>(`/alerts/${id}/acknowledge`,{method:'POST'}),
 removePatientAssignment:(id:string)=>request<void>(`/patients/${id}/assignment`,{method:'DELETE'}),
 care:(id:string)=>request<CareEntry[]>(`/patients/${id}/care`),
 addCare:(id:string,data:CareInput)=>request<CareEntry>(`/patients/${id}/care`,{method:'POST',body:JSON.stringify(data)}),
 completeFollowUp:(id:string,entry:string)=>request<CareEntry>(`/patients/${id}/care/${entry}/complete`,{method:'PATCH'}),
 draftCare:(id:string,review:string)=>request<{draft:string}>(`/patients/${id}/care/draft`,{method:'POST',body:JSON.stringify({review})}),
 mlModel:()=>request<MLModel>('/ml/model'),mlPredict:(id:string)=>request<MLPrediction>(`/patients/${id}/ml/predict`,{method:'POST'}),mlPredictions:(id:string)=>request<MLPrediction[]>(`/patients/${id}/ml/predictions`),
 logout:()=>{accessToken=null;lastRefreshedFrom=null;lastRefreshedAccess=null;localStorage.removeItem('access_token');localStorage.removeItem('refresh_token')},hasToken:()=>Boolean(accessToken)
};
