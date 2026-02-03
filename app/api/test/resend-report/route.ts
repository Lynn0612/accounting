import { NextRequest, NextResponse } from "next/server";

/**
 * Manual trigger endpoint for LINE monthly report
 * 
 * Usage:
 * GET /api/test/resend-report?month=2026-02
 * 
 * This endpoint calls the Supabase Edge Function to resend the monthly report
 * for the specified month (format: YYYY-MM)
 */

// Ensure this route is not statically generated
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get("month"); // Format: YYYY-MM (e.g., 2026-02)
    
    if (!month) {
      return NextResponse.json(
        { error: "Missing 'month' parameter. Use format: YYYY-MM (e.g., 2026-02)" },
        { status: 400 }
      );
    }

    // Validate month format
    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      return NextResponse.json(
        { error: "Invalid month format. Use YYYY-MM (e.g., 2026-02)" },
        { status: 400 }
      );
    }

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);

    if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json(
        { error: "Invalid month. Month must be between 01 and 12" },
        { status: 400 }
      );
    }

    // Get Supabase URL and anon key from environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    // Call the Supabase Edge Function
    const functionUrl = `${supabaseUrl}/functions/v1/line-ledger-summary?month=${month}`;
    
    console.log(`Triggering LINE report for month: ${month}`);
    console.log(`Function URL: ${functionUrl}`);

    const response = await fetch(functionUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
      },
    });

    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    if (!response.ok) {
      console.error("Edge function error:", responseData);
      return NextResponse.json(
        { 
          error: "Failed to trigger report",
          details: responseData,
          status: response.status 
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Report triggered for ${year}/${String(monthNum).padStart(2, '0')}`,
      month: `${year}/${String(monthNum).padStart(2, '0')}`,
      response: responseData,
    });

  } catch (error) {
    console.error("Error triggering report:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

