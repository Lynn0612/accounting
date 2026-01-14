import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const LINE_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    // Parse request body to get user_id
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch user's line_user_id from profiles table
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("line_user_id, full_name")
      .eq("id", user_id)
      .single();

    if (profileError) {
      console.error("Error fetching profile:", profileError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch user profile", details: profileError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "User profile not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!profile.line_user_id) {
      return new Response(
        JSON.stringify({ error: "User does not have a LINE user ID. Please login via LINE first." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create a test Flex Message
    const flexMessage = {
      type: "flex",
      altText: "測試通知",
      contents: {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "測試通知",
              weight: "bold",
              size: "xl",
              color: "#FFFFFF"
            }
          ],
          backgroundColor: "#1DB446",
          paddingAll: "20px"
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "Hello! This is a test notification",
              wrap: true,
              size: "md",
              color: "#666666",
              margin: "md"
            },
            {
              type: "separator",
              margin: "md"
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  text: `發送給: ${profile.full_name || "User"}`,
                  size: "sm",
                  color: "#999999",
                  margin: "sm"
                },
                {
                  type: "text",
                  text: `LINE ID: ${profile.line_user_id}`,
                  size: "xs",
                  color: "#CCCCCC",
                  margin: "xs"
                }
              ],
              margin: "md"
            }
          ],
          paddingAll: "20px"
        }
      }
    };

    // Send message via LINE Messaging API
    const lineResponse = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_TOKEN}`
      },
      body: JSON.stringify({
        to: profile.line_user_id,
        messages: [flexMessage]
      })
    });

    if (!lineResponse.ok) {
      const errorData = await lineResponse.text();
      console.error("LINE API error:", errorData);
      return new Response(
        JSON.stringify({
          error: "Failed to send LINE message",
          details: errorData,
          status: lineResponse.status
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const lineResult = await lineResponse.json();

      return new Response(
        JSON.stringify({
          success: true,
          message: "Test notification sent successfully",
          user_id: user_id,
          line_user_id: profile.line_user_id,
          line_response: lineResult
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (err) {
      console.error("Error:", err);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          details: String(err)
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
});

