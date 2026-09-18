require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { Client } = require('@gradio/client');
const { runQuery, getQuery } = require('./database');

const BOT_TOKEN = process.env.BOT_TOKEN || '8677191661:AAFd67jxq9RLJmYhgaEZvCQMewsE3zIGqYE';
if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required');

const bot = new Telegraf(BOT_TOKEN);

const mainMenu = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📖 How to Use', 'how_to_use')],
    [Markup.button.callback('📊 My Stats', 'my_stats')],
    [Markup.button.callback('ℹ️ About', 'about')],
  ]);
};

bot.start(async (ctx) => {
  const chatId = String(ctx.chat.id);
  await runQuery('INSERT OR IGNORE INTO users (chat_id) VALUES (?)', [chatId]);

  const welcomeMsg =
`🎨 *Welcome to Watermark Remover Bot!*

I can remove watermarks from your images for *FREE*.

📌 *How to use:*
1️⃣ Send me a photo with a watermark
2️⃣ Wait 10-30 seconds for AI processing
3️⃣ I'll send you the clean image back

⚡ *No signup. No payment. Just send a photo!*`;

  await ctx.replyWithMarkdown(welcomeMsg, mainMenu());
});

bot.command('help', async (ctx) => {
  await ctx.replyWithMarkdown(
`📚 *Help Guide*

• Send any image with a watermark
• The bot will remove it automatically
• Works with text watermarks, logos, and stamps
• Please wait 10-30 seconds for processing

⚠️ *Tips for best results:*
• Use clear, high-quality images
• Simple watermarks remove better than complex ones
• Images up to 5 MB work best` + '\n\nType /start to begin.'
  );
});

bot.command('stats', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const user = await getQuery('SELECT total_images FROM users WHERE chat_id = ?', [chatId]);
  const count = user ? user.total_images : 0;
  await ctx.replyWithMarkdown(
`📊 *Your Statistics*

🖼️ Images processed: *${count}*

Keep using the bot to track more!`
  );
});

bot.on('photo', async (ctx) => {
  const chatId = String(ctx.chat.id);
  await runQuery('INSERT OR IGNORE INTO users (chat_id) VALUES (?)', [chatId]);

  const statusMsg = await ctx.reply('⏳ *Processing your image...*\n\nThis may take 10-30 seconds.', { parse_mode: 'Markdown' });

  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;

    const fileLink = await ctx.telegram.getFileLink(fileId);
    const fileUrl = fileLink.href;

    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error('Failed to download image from Telegram');
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });

    await ctx.telegram.editMessageText(
      chatId,
      statusMsg.message_id,
      undefined,
      '🤖 *AI is removing the watermark...*\n\nPlease wait...',
      { parse_mode: 'Markdown' }
    );

    const app = await Client.connect('fffiloni/watermark-remover');
    const result = await app.predict('/predict', [imageBlob]);

    let resultUrl = null;
    if (result && result.data && Array.isArray(result.data) && result.data.length > 0) {
      const firstData = result.data[0];
      if (typeof firstData === 'string') {
        resultUrl = firstData;
      } else if (firstData && firstData.url) {
        resultUrl = firstData.url;
      }
    }

    if (!resultUrl) {
      throw new Error('No result URL returned from AI service');
    }

    const processedResponse = await fetch(resultUrl);
    if (!processedResponse.ok) throw new Error('Failed to download processed image');
    const processedBuffer = Buffer.from(await processedResponse.arrayBuffer());

    await ctx.telegram.deleteMessage(chatId, statusMsg.message_id);

    await ctx.replyWithPhoto(
      { source: processedBuffer },
      {
        caption:
`✅ *Watermark removed successfully!*

💡 *Tip:* If the result isn't perfect, try sending a clearer version of the image.

Want to remove another? Just send another photo!`,
        parse_mode: 'Markdown',
        ...mainMenu()
      }
    );

    await runQuery('UPDATE users SET total_images = total_images + 1 WHERE chat_id = ?', [chatId]);
    await runQuery('INSERT INTO history (chat_id) VALUES (?)', [chatId]);

  } catch (error) {
    console.error('Error processing image:', error.message);

    try {
      await ctx.telegram.deleteMessage(chatId, statusMsg.message_id);
    } catch (e) {}

    await ctx.replyWithMarkdown(
`❌ *Sorry, something went wrong.*

Possible reasons:
• The AI service is busy (try again in 1 minute)
• The image is too large (try under 5 MB)
• Network issue (please retry)

Please try sending the image again.`
    );
  }
});

bot.action('how_to_use', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown(
`📖 *How to Use This Bot*

1️⃣ Send any photo with a watermark
2️⃣ Wait 10-30 seconds
3️⃣ Receive the cleaned image

*What kind of watermarks can I remove?*
• Text watermarks
• Logos
• Stamps
• Signatures

*Limitations:*
• Max image size: 5 MB
• Complex watermarks may not be fully removed`
  );
});

bot.action('my_stats', async (ctx) => {
  await ctx.answerCbQuery();
  const chatId = String(ctx.chat.id);
  const user = await getQuery('SELECT total_images FROM users WHERE chat_id = ?', [chatId]);
  const count = user ? user.total_images : 0;
  await ctx.replyWithMarkdown(`📊 You have processed *${count}* images so far.`);
});

bot.action('about', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown(
`ℹ️ *About This Bot*

This bot uses free, open-source AI technology to remove watermarks from images.

🔒 *Privacy:* Images are not stored on our servers permanently.

⚡ *Powered by:* Node.js + Telegraf + Hugging Face AI

💚 *Completely FREE to use!*`
  );
});

const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('✅ Watermark Remover Bot is running!');
});

app.listen(PORT, () => {
  console.log(`✅ HTTP Server running on port ${PORT}`);
});

bot.launch().then(() => {
  console.log('🚀 Watermark Remover Bot started successfully!');
});

process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });
