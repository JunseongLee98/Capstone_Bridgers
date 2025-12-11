import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy route to fetch ICS files from URLs to avoid CORS issues
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { error: 'URL parameter is required' },
      { status: 400 }
    );
  }

  try {
    // Validate URL
    const targetUrl = new URL(url);
    
    // Only allow HTTPS URLs for security
    if (targetUrl.protocol !== 'https:') {
      return NextResponse.json(
        { error: 'Only HTTPS URLs are allowed' },
        { status: 400 }
      );
    }

    // Fetch the ICS file
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Cadence Calendar App',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch calendar: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const content = await response.text();
    
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/calendar',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
  } catch (error: any) {
    console.error('Error proxying ICS file:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch calendar' },
      { status: 500 }
    );
  }
}

