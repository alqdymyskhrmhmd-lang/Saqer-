export default async (req, context) => {
  // 1. التحقق من طريقة الطلب
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "الطريقة غير مدعومة (Method Not Allowed)" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  // 2. التحقق من وجود المتغيرات السرية في البيئة
  const botToken = process.env.BOT_TOKEN;
  const chatId = process.env.CHAT_ID;

  if (!botToken || !chatId) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "خادم الموقع غير مكتمل الإعداد (متغيرات البيئة مفقودة)"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  // 3. قراءة وتحليل بيانات الطلب
  let body;
  try {
    body = await req.json();
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: "صيغة البيانات غير صالحة" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  const { consentGiven, systemInfo, locationInfo } = body;

  // التحقق من موافقة المستخدم
  if (!consentGiven) {
    return new Response(
      JSON.stringify({ ok: false, error: "لم يتم تقديم الموافقة المطلوبة للإرسال" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  if (!systemInfo || typeof systemInfo !== "object") {
    return new Response(
      JSON.stringify({ ok: false, error: "البيانات التشخيصية مفقودة أو غير صحيحة" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  // 4. بناء نص التقرير
  let message = `📌 *تقرير الفحص التشخيصي للجهاز*\n\n`;
  message += `🖥 *نظام التشغيل المصرح:* ${escapeMarkdown(systemInfo.os || "غير معروف")}\n`;
  message += `🌐 *المتصفح:* ${escapeMarkdown(systemInfo.browser || "غير معروف")}\n`;
  message += `💻 *المنصة:* ${escapeMarkdown(systemInfo.platform || "غير معروف")}\n`;
  message += `🗣 *اللغة:* ${escapeMarkdown(systemInfo.language || "غير معروف")}\n`;
  message += `📐 *أبعاد الشاشة:* ${escapeMarkdown(systemInfo.screen || "غير معروف")}\n`;
  message += `🕒 *المنطقة الزمنية:* ${escapeMarkdown(systemInfo.timezone || "غير معروف")}\n`;
  message += `⚙️ *أنوية المعالج:* ${escapeMarkdown(systemInfo.cores || "غير متاح")}\n`;

  if (locationInfo && locationInfo.included) {
    message += `\n📍 *الموقع الجغرافي (بموافقة المستخدم):*\n`;
    message += `• خط العرض: \`${locationInfo.latitude}\`\n`;
    message += `• خط الطول: \`${locationInfo.longitude}\`\n`;
    message += `• الدقة التقريبية: \`${locationInfo.accuracy} متر\`\n`;
    message += `• رابط الخريطة: [Google Maps](https://maps.google.com/?q=${locationInfo.latitude},${locationInfo.longitude})\n`;
  } else {
    message += `\n📍 *الموقع الجغرافي:* لم يُطلب أو تم رفض الإذن من المستخدم.\n`;
  }

  // التأكد من حدود طول الرسالة في تيليجرام
  if (message.length > 4000) {
    message = message.substring(0, 3990) + "...";
  }

  // 5. الإرسال إلى Telegram Bot API
  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const telegramRes = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: true
      })
    });

    const telegramData = await telegramRes.json();

    if (!telegramRes.ok || !telegramData.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "رفض Telegram API إرسال التقرير",
          details: telegramData.description || "استجابة غير صالحة من تيليجرام"
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, message: "تم تسليم التقرير للبوت بنجاح" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "فشل الاتصال بخوادم تيليجرام الخارجية",
        details: err.message
      }),
      {
        status: 504,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};

// وظيفة لتنظيف وتأمين الرموز الخاصة في Markdown الخاص بـ Telegram
function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+-=|{}.!]/g, "\\$&");
}
