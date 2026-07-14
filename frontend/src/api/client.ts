import type {
  AgentInvokeRequest,
  AgentInvokeResponse,
  AgentInfo,
  AnalyzePostRequest,
  AnalyzePostResponse,
  HealthResponse,
  PubIQRequest,
  PubIQResponse,
  TikTokProfile,
  TikTokVideosResponse,
} from './types'

// On Android/iOS (file:// origin) relative URLs don't work — point straight at the backend
const isNative = window.location.protocol === 'file:'
const BASE = isNative ? 'http://192.168.1.155:8000' : '/api'

function getApiKey(): string {
  return localStorage.getItem('omicron_api_key') ?? ''
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const key = getApiKey()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'X-API-Key': key } : {}),
      ...(options.headers ?? {}),
    },
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch { /* ignore */ }
    throw new ApiError(res.status, detail)
  }

  return res.json() as Promise<T>
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

export const api = {
  health(): Promise<HealthResponse> {
    return request<HealthResponse>('/health')
  },

  listAgents(): Promise<AgentInfo[]> {
    return request<AgentInfo[]>('/v1/agents')
  },

  invokeAgent(name: string, input: Record<string, unknown>): Promise<AgentInvokeResponse> {
    const body: AgentInvokeRequest = { input }
    return request<AgentInvokeResponse>(`/v1/agents/${name}/invoke`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  analyzePost(req: AnalyzePostRequest): Promise<AnalyzePostResponse> {
    return request<AnalyzePostResponse>('/v1/pipeline/analyze-post', {
      method: 'POST',
      body: JSON.stringify(req),
    })
  },

  startWorkflow(req: PubIQRequest): Promise<PubIQResponse> {
    return request<PubIQResponse>('/v1/workflows/pubiq', {
      method: 'POST',
      body: JSON.stringify(req),
    })
  },

  getCreatorProfile(creatorId: string): Promise<TikTokProfile> {
    return request<TikTokProfile>(`/auth/tiktok/profile/${encodeURIComponent(creatorId)}`)
  },

  listCreatorVideos(creatorId: string): Promise<TikTokVideosResponse> {
    return request<TikTokVideosResponse>(`/auth/tiktok/videos/${encodeURIComponent(creatorId)}`)
  },

  authorizeTikTok(creatorId: string): string {
    return `/api/auth/tiktok/authorize?creator_id=${encodeURIComponent(creatorId)}`
  },
}
