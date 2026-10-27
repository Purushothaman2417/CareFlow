import { Response } from "express";
import { z } from "zod";

import { AuthRequest } from "../middleware/authMiddleware";

const SYSTEM_PROMPT = `You are CareFlow Assistant, a clinical decision-support helper inside a healthcare booking app.
Given a patient's description of symptoms, respond in concise markdown with:
1. **Possible causes** (2-4, plain language, no certainty claims)
2. **Suggested specialty** — pick ONE from: General Medicine, Cardiology, Dermatology, Pediatrics, Orthopedics, Neurology, Gynecology, Psychiatry, ENT, Ophthalmology
3. **Urgency**: Routine / Soon (within days) / Urgent (seek emergency care now)
4. **Self-care tips** while waiting
Always end with: "_This is not a diagnosis. Please consult a licensed doctor._"
If symptoms suggest an emergency (chest pain, stroke signs, severe bleeding, difficulty breathing, suicidal thoughts), say so first and advise calling emergency services immediately.`;

const askSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(4000),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .refine((data) => data.messages[data.messages.length - 1]?.role === "user", {
    message: "The latest message must be from the user",
  });

type GatewayResponse = {
  choices?: { message?: { content?: string } }[];
};

function getDemoAssistantReply(input: string): string {
  const text = input.toLowerCase();
  const emergencySignals = [
    /chest pain/,
    /difficulty breathing|trouble breathing|shortness of breath|can['’]?t breathe/,
    /stroke|face droop|slurred speech|weakness on (one|1) side/,
    /severe bleeding|won['’]?t stop bleeding/,
    /suicidal|suicide|self[- ]harm|hurt myself/,
    /unconscious|not waking|seizure/,
  ];
  if (emergencySignals.some((signal) => signal.test(text))) {
    return [
      "**Urgent — seek emergency care now.**",
      "Your message includes a symptom that can be an emergency. Call your local emergency number or go to the nearest emergency department now; do not wait for an online response.",
      "**Suggested specialty:** Emergency care",
      "**While waiting:** Ask someone nearby to stay with you. Do not drive yourself if you feel faint, confused, or severely unwell.",
      "",
      "_This is not a diagnosis. Please consult a licensed doctor._",
    ].join("\n");
  }

  let specialty = "General Medicine";
  let causes = [
    "a common, short-lived illness or irritation",
    "a change in sleep, hydration, activity, or routine",
    "another cause that needs assessment in context",
  ];
  let urgency = "Routine";
  let selfCare =
    "Rest, drink fluids if appropriate for you, and note when symptoms started and what changes them.";

  if (/rash|itch|hives|skin|redness/.test(text)) {
    specialty = "Dermatology";
    causes = [
      "skin irritation or contact dermatitis",
      "an allergic reaction",
      "another skin condition that needs an examination",
    ];
    selfCare =
      "Avoid new products on the area and note any possible triggers. Seek urgent help for facial swelling or breathing difficulty.";
  } else if (/heart|palpitation|heartbeat|chest tightness/.test(text)) {
    specialty = "Cardiology";
    urgency = "Soon (within days)";
    causes = [
      "a temporary change in heart rhythm",
      "stress, caffeine, or another trigger",
      "a heart or other health condition that needs clinical assessment",
    ];
    selfCare =
      "Pause strenuous activity and note when episodes happen. Seek emergency care now for chest pain, fainting, or difficulty breathing.";
  } else if (/child|baby|infant|toddler|my son|my daughter/.test(text)) {
    specialty = "Pediatrics";
    causes = [
      "a common childhood infection",
      "an allergy or temporary irritation",
      "another cause that depends on the child's age and symptoms",
    ];
    selfCare =
      "Encourage rest and fluids if appropriate, and monitor temperature and behavior. Seek urgent care for difficulty breathing, unusual drowsiness, or rapid worsening.";
  } else if (/knee|joint|sprain|ankle|back pain|muscle|injury/.test(text)) {
    specialty = "Orthopedics";
    causes = [
      "muscle or soft-tissue strain",
      "overuse or joint irritation",
      "another injury that may need an examination",
    ];
    selfCare =
      "Avoid activities that worsen the pain and rest the area. Seek prompt care for severe pain, major swelling, deformity, or inability to bear weight.";
  } else if (/eye|vision|blurry|blurred|red eye/.test(text)) {
    specialty = "Ophthalmology";
    urgency = /vision loss|sudden|severe pain/.test(text)
      ? "Urgent (seek care now)"
      : "Routine";
    causes = [
      "temporary eye irritation or dryness",
      "an infection or allergy",
      "another eye condition that needs assessment",
    ];
    selfCare =
      "Avoid rubbing the eye and remove contact lenses if they are uncomfortable. Sudden vision loss or severe eye pain needs urgent assessment.";
  } else if (/ear|hearing|sinus|sore throat|nosebleed/.test(text)) {
    specialty = "ENT";
    causes = [
      "a common infection or irritation",
      "allergy or sinus congestion",
      "another ear, nose, or throat condition",
    ];
    selfCare =
      "Rest and drink fluids if appropriate. Seek prompt care for severe pain, difficulty swallowing, or symptoms that are worsening.";
  } else if (/headache|migraine|dizz|numbness|tingling/.test(text)) {
    specialty = "Neurology";
    urgency = /severe|worsening|persistent/.test(text)
      ? "Soon (within days)"
      : "Routine";
    causes = [
      "tension, dehydration, or lack of sleep",
      "a migraine or another common headache pattern",
      "another cause that depends on the full symptom history",
    ];
    selfCare =
      "Rest somewhere comfortable and keep track of onset and triggers. Sudden severe headache, confusion, fainting, or one-sided weakness needs emergency care.";
  } else if (/anxious|anxiety|depress|panic|mood|stress/.test(text)) {
    specialty = "Psychiatry";
    urgency = /worsening|unable to cope/.test(text)
      ? "Soon (within days)"
      : "Routine";
    causes = [
      "stress or a difficult life situation",
      "anxiety or a mood concern",
      "another health or wellbeing factor",
    ];
    selfCare =
      "Consider reaching out to someone you trust and arranging professional support. If you may harm yourself or cannot stay safe, contact emergency services now.";
  } else if (/cough|fever|cold|sneeze|fatigue|tired|stomach|nausea|vomit/.test(text)) {
    urgency = /high fever|worsening|persistent|severe/.test(text)
      ? "Soon (within days)"
      : "Routine";
    causes = [
      "a common viral illness",
      "an allergy or other temporary irritation",
      "another cause that needs assessment if it persists",
    ];
    selfCare =
      "Rest, drink fluids if appropriate, and monitor how symptoms change. Seek urgent care for difficulty breathing, dehydration, confusion, or rapid worsening.";
  }

  const concern = input.trim().replace(/\s+/g, " ").slice(0, 240);
  return [
    `**What you described:** ${concern}${input.trim().length > 240 ? "…" : ""}`,
    "**Possible causes**",
    ...causes.map((cause) => `- ${cause}`),
    "",
    `**Suggested specialty:** ${specialty}`,
    `**Urgency:** ${urgency}`,
    `**Self-care tips:** ${selfCare}`,
    "",
    "_This guidance is generated from symptom keywords and is not a clinical assessment. Please consult a licensed doctor._",
  ].join("\n");
}

export const askAssistant = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }
  if (req.user.role !== "patient") {
    res.status(403).json({
      success: false,
      message: "The symptom assistant is available to patient accounts",
    });
    return;
  }

  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Provide a valid conversation with a user message",
    });
    return;
  }

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    if (process.env.CAREFLOW_DEMO_MODE === "true") {
      const latestMessage = parsed.data.messages[parsed.data.messages.length - 1];
      if (!latestMessage) {
        res.status(400).json({
          success: false,
          message: "Provide a valid conversation with a user message",
        });
        return;
      }
      res.status(200).json({
        success: true,
        reply: getDemoAssistantReply(latestMessage.content),
      });
      return;
    }
    console.error("Symptom assistant is unavailable: LOVABLE_API_KEY is not configured");
    res.status(503).json({
      success: false,
      message: "The assistant is not configured right now",
    });
    return;
  }

  try {
    const gatewayResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...parsed.data.messages,
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (gatewayResponse.status === 429) {
      res.status(429).json({
        success: false,
        message: "The assistant is busy. Please wait a moment and try again.",
      });
      return;
    }
    if (gatewayResponse.status === 402) {
      res.status(503).json({
        success: false,
        message: "The assistant is temporarily unavailable.",
      });
      return;
    }
    if (!gatewayResponse.ok) {
      console.error(
        "Symptom assistant gateway returned HTTP",
        gatewayResponse.status,
      );
      res.status(502).json({
        success: false,
        message: "The assistant is unavailable right now.",
      });
      return;
    }

    const result = (await gatewayResponse.json()) as GatewayResponse;
    const reply = result.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      console.error("Symptom assistant gateway returned no message content");
      res.status(502).json({
        success: false,
        message: "The assistant returned an empty response. Please try again.",
      });
      return;
    }

    res.status(200).json({ success: true, reply });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    console.error(
      "Symptom assistant request failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(timedOut ? 504 : 502).json({
      success: false,
      message: timedOut
        ? "The assistant took too long to respond. Please try again."
        : "The assistant is unavailable right now.",
    });
  }
};
