import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

async function proxyRequest(request: NextRequest, path: string) {
  const url = `${BACKEND_URL}/${path}`

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase()
    if (lowerKey !== 'host' && lowerKey !== 'connection' && lowerKey !== 'content-length') {
      headers.set(key, value)
    }
  })

  const requestInit: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const body = await request.arrayBuffer()
    if (body.byteLength > 0) {
      requestInit.body = body
    }
  }

  const response = await fetch(url, requestInit)

  const responseHeaders = new Headers()
  response.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase()
    if (lowerKey !== 'content-encoding' && lowerKey !== 'content-length' && lowerKey !== 'transfer-encoding') {
      responseHeaders.append(key, value)
    }
  })

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (location) {
      return NextResponse.redirect(location, response.status)
    }
  }

  const responseBody = await response.arrayBuffer()

  const nextResponse = new NextResponse(responseBody, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })

  // Explicitly copy Set-Cookie headers (they need special handling)
  const setCookieHeaders = response.headers.getSetCookie?.() || []
  for (const cookie of setCookieHeaders) {
    nextResponse.headers.append('Set-Cookie', cookie)
  }

  return nextResponse
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const pathStr = path.join('/')
  const searchParams = request.nextUrl.searchParams.toString()
  const fullPath = searchParams ? `${pathStr}?${searchParams}` : pathStr
  return proxyRequest(request, fullPath)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path.join('/'))
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path.join('/'))
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path.join('/'))
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path.join('/'))
}
