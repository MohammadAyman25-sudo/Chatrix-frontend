import axios, { type AxiosInstance } from 'axios'
import { mockApi } from '@/lib/mock/client'
import { USE_MOCK } from '@/lib/mock/config'
import { API_ORIGIN } from '@/lib/media'

const realApi = axios.create({
  baseURL: `${API_ORIGIN}/api/v1`,
  withCredentials: true, // send httpOnly cookies
})

realApi.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        await axios.post('http://localhost:5000/api/v1/auth/refresh', {}, { withCredentials: true })
        return realApi(original)
      } catch (e) {
        return Promise.reject(e)
      }
    }
    return Promise.reject(error)
  },
)

/**
 * In dev the app talks to the in-browser mock API (see `.env.development`).
 * Flip `VITE_USE_MOCK=false` to use the real backend without touching code.
 */
const api = USE_MOCK ? (mockApi as unknown as AxiosInstance) : realApi

export default api
