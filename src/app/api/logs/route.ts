import { NextRequest, NextResponse } from 'next/server';
import { insertLog, queryLogs, LogEntry } from '@/lib/db';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle OPTIONS preflight
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// POST - Create a new log entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.category || !body.action) {
      return NextResponse.json(
        { success: false, error: 'category and action are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const entry: Omit<LogEntry, 'id' | 'created_at'> = {
      timestamp: body.timestamp || new Date().toISOString(),
      category: body.category,
      action: body.action,
      details: body.details || {},
      session_id: body.session_id,
      duration_ms: body.duration_ms,
      cost: body.cost,
    };

    const result = await insertLog(entry);
    
    return NextResponse.json({ 
      success: true, 
      id: result.id,
      message: 'Log entry created' 
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Log insert error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500, headers: corsHeaders }
    );
  }
}

// GET - Query logs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const options = {
      category: searchParams.get('category') || undefined,
      session_id: searchParams.get('session_id') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      limit: parseInt(searchParams.get('limit') || '100'),
      offset: parseInt(searchParams.get('offset') || '0'),
    };

    const logs = await queryLogs(options);
    
    return NextResponse.json({ 
      success: true, 
      count: logs.length,
      logs 
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Log query error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500, headers: corsHeaders }
    );
  }
}
