import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';

export async function POST() {
  try {
    const result = await initDb();
    return NextResponse.json({ success: true, message: 'Database initialized', ...result });
  } catch (error) {
    console.error('Init error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'POST to this endpoint to initialize the database tables' 
  });
}
