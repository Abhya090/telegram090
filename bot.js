const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const { Client } = require("ssh2");

const TOKEN = process.env.BOT_TOKEN || "";
const CHAT_ID = process.env.CHAT_ID || "";

const SERVERS_FILE = "servers.json";

// Load the servers from the JSON file
let servers = [];
let current = null;

// Connect to the SSH server using ssh2
const ssh = new Client();
let pwd = "~";

ssh.on("ready", async () => {
  await bot.sendMessage(CHAT_ID, "SSH connection established.");
});

const sshExecute = (command, ping) => {
  const conmm = `cd ${pwd} && ${command}`;

  ssh.exec(conmm, (err, stream) => {
    let result = "";

    if (err) {
      result = `${{ name: err.name, message: err.message, stack: err.stack }}`;
      console.log(err);
    }

    stream.on("data", (data) => {
      result += data.toString();
    });

    stream.on("close", async (code, signal) => {
      // save pwd
      if (command.includes("cd ")) {
        pwd = command.split("cd ")[1];
      }
      if (ping) {
        await bot.editMessageText(
          `<b>${pwd}# ${command}</b>\n${result || pwd}`,
          {
            message_id: ping.message_id,
            chat_id: ping.chat.id,
            parse_mode: "HTML",
          }
        );
      } else {
        await bot.sendMessage(
          CHAT_ID,
          `<b>${pwd}# ${command}</b>\n${result || pwd}`,
          {
            parse_mode: "HTML",
          }
        );
      }
    });
  });
};

if (fs.existsSync(SERVERS_FILE)) {
  servers = JSON.parse(fs.readFileSync(SERVERS_FILE, "utf8"));
} else {
  fs.writeFileSync(SERVERS_FILE, "[]", "utf8");
}

// Create a new Telegram bot instance
const bot = new TelegramBot(TOKEN, { polling: true });

async function checkOwner(msg) {
  if (msg?.chat?.id.toString() !== CHAT_ID) {
    await bot.sendMessage(CHAT_ID, `Got other access\n${JSON.stringify(msg)}`);
    return false;
  }
  return true;
}

bot.setMyCommands([
  { command: "add", description: "add new server /add user@abc.com" },
  { command: "list", description: "list servers" },
  { command: "current", description: "current server" },
  { command: "rm", description: "remove server" },
  { command: "connect", description: "/connect username@hostip" },
  { command: "exit", description: "exit" },
]);

// CRUD
bot.onText(/\/list/, async (msg) => {
  const o = await checkOwner(msg);
  if (!o) {
    return;
  }
  let message = `List of Servers: ${servers.length}\n`;
  servers.forEach((s, i) => {
    message += `${i + 1}: ${s}\n`;
  });

  await bot.sendMessage(CHAT_ID, message, {
    disable_web_page_preview: true,
    protect_content: true,
  });
});
bot.onText(/\/current/, async (msg) => {
  const o = await checkOwner(msg);
  if (!o) {
    return;
  }
  if (!current) {
    await bot.sendMessage(
      CHAT_ID,
      `No server is currently selected. Please connect to a server first.`
    );
    return;
  }
  await bot.sendMessage(CHAT_ID, `Current server: ${current}`, {
    disable_web_page_preview: true,
    protect_content: true,
  });
});
bot.onText(/\/connect (.+)/, async (msg, match) => {
  const o = await checkOwner(msg);
  if (!o) {
    return;
  }
  const connectionInfo = match[1].trim();
  const [username, host] = connectionInfo.split('@');
  
  if (!username || !host) {
    await bot.sendMessage(CHAT_ID, "Invalid format. Please use /connect username@hostip");
    return;
  }

  current = `${username}@${host}`;
  // Prompt the user to send the private key file for authentication
  await bot.sendMessage(CHAT_ID, `Please send your private key file for ${current}`);
});

// Listen for private key file messages
bot.on("document", async (msg) => {
  if (current && msg.document) {
    const fileId = msg.document.file_id;
    const file = await bot.getFile(fileId);
    const filePath = file.file_path;
    const privateKeyPath = `./${msg.from.id}_${msg.document.file_name}`;
    await bot.downloadFile(filePath, privateKeyPath);

    // Connect to the server using the provided details and private key file
    const [username, host] = current.split('@');
    ssh.connect({
      host: host,
      username: username,
      privateKey: fs.readFileSync(privateKeyPath),
    });

    // Delete the private key file after use
    fs.unlinkSync(privateKeyPath);
  }
});

bot.onText(/\/exit/, async (msg, match) => {
  const o = await checkOwner(msg);
  if (!o) {
    return;
  }
  current = null;
  ssh.end();

  await bot.sendMessage(CHAT_ID, `Reset current server`, {
    disable_web_page_preview: true,
    protect_content: true,
  });
});

bot.on("text", async (msg) => {
  const o = await checkOwner(msg);
  if (!o || isBotCommand(msg)) {
    return;
  }
  if (!current && ssh) {
    await bot.sendMessage(
      CHAT_ID,
      `No server is currently selected. Please connect to a server first.`
    );
    return;
  }
  const ping = await bot.sendMessage(CHAT_ID, `Executing command...`);
  try {
    sshExecute(msg.text.trim(), ping);
  } catch (error) {
    console.log(error);
    await bot.editMessageText(`Error: ${JSON.stringify(error, null, 2)}`, {
      message_id: ping.message_id,
      chat_id: ping.chat.id,
    });
  }
});

// Helper
function isBotCommand(message) {
  if (!message || !message.entities) {
    return false;
  }
  const botCommands = message.entities.filter(
    (entity) => entity.type === "bot_command"
  );
  return botCommands.length > 0;
    }
