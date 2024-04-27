const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const dotenv = require("dotenv");
const { Client } = require("ssh2");
dotenv.config();

const TOKEN = process.env.BOT_TOKEN || "";
const CHAT_ID = process.env.CHAT_ID || "";
const OWNER_IDS = process.env.OWNER_IDS || "";

const SERVERS_FILE = "servers.json";

// Load the servers from the JSON file
let servers = [];
let current = null;

// Connect to the SSH server using ssh2
const ssh = new Client();
let pwd = "~";

ssh.on("ready", async () => {
  await bot.sendMessage(CHAT_ID, "ssh successfully.");
});

const sshExcute = (command, ping) => {
  if (command.startsWith("cd ")) {
    // Handle cd command separately
    const directory = command.substring(3).trim(); // Extract the directory path
    pwd = directory; // Update the current directory
    return bot.sendMessage(CHAT_ID, `Changed directory to: ${pwd}`);
  } else if (command === "ls") {
    // Handle ls command separately
    command = "ls"; // Simply execute ls command
  }

  const fullCommand = `cd ${pwd} && ${command}`; // Prefix command with cd to ensure it's executed in the correct directory

  ssh.exec(fullCommand, (err, stream) => {
    let result = "";

    if (err) {
      result = `${{ name: err.name, message: err.message, stack: err.stack }}`;
      console.log(err);
    }

    stream.on("data", (data) => {
      result += data.toString();
    });

    stream.on("close", async (code, signal) => {
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
  if (!OWNER_IDS.includes(msg?.chat?.id)) {
    await bot.sendMessage(CHAT_ID, `Got other access\n${JSON.stringify(msg)}`);
    return false;
  }
  return true;
}

bot
  .setMyCommands([
    { command: "add", description: "add new an server /add user@abc.com" },
    { command: "list", description: "list server" },
    { command: "current", description: "current server" },
    { command: "rm", description: "remove server" },
    { command: "connect", description: "/connect ID | IP" },
    { command: "exit", description: "exit" },
    { command: "bgmi", description: "execute bgmi command on server" },
  ])
  .then((res) => {
    console.log(res);
  });

// CRUD
bot.onText(/\/list/, async (msg) => {
  const o = await checkOwner(msg);
  if (!o) {
    return;
  }
  let message = `List Server: ${servers.length}\n`;
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
      `No server now, please connect one server before next.`
    );
    return;
  }
  await bot.sendMessage(CHAT_ID, `Current: ${current}`, {
    disable_web_page_preview: true,
    protect_content: true,
  });
});
bot.onText(/\/add (.+)/, async (msg, match) => {
  const o = await checkOwner(msg);
  if (!o) {
    await bot.sendMessage(CHAT_ID, "Value is invalid.");
    return;
  }
  const sv = match[1].trim().toLocaleLowerCase();
  if (sv.includes("@")) {
    servers.push(sv);
    fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers), "utf8");
    await bot.sendMessage(CHAT_ID, `Add ${sv} success`, {
      disable_web_page_preview: true,
      protect_content: true,
    });
  } else {
    await bot.sendMessage(CHAT_ID, `${sv} is not valid`, {
      disable_web_page_preview: true,
      protect_content: true,
    });
  }
});
bot.onText(/\/rm (.+)/, async (msg, match) => {
  const o = await checkOwner(msg);
  if (!o) {
    return;
  }
  const sv = match[1].trim().toLocaleLowerCase();
  let find = null;
  if (
    sv.includes("@") &&
    servers.length !== servers.filter((s) => s !== sv).length
  ) {
    find = sv;
  } else {
    const index = parseFloat(sv) - 1;
    find = servers[index];
  }

  if (find) {
    servers = servers.filter((s) => s !== find);
    fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers), "utf8");
    await bot.sendMessage(CHAT_ID, `Remove ${sv} success`, {
      disable_web_page_preview: true,
      protect_content: true,
    });
  } else {
    await bot.sendMessage(CHAT_ID, `${sv} is not valid`, {
      disable_web_page_preview: true,
      protect_content: true,
    });
  }
});

// ssh
bot.onText(/\/connect (.+)/, async (msg, match) => {
  const o = await checkOwner(msg);
  if (!o) {
    return;
  }
  const sv = match[1].trim().toLocaleLowerCase();
  let find = null;
  if (
    sv.includes("@") &&
    servers.length !== servers.filter((s) => s !== sv).length
  ) {
    find = sv;
  } else {
    const index = parseFloat(sv) - 1;
    find = servers[index];
  }
  if (find) {
    current = find;
    // try connect to current server
    const info = current.split("@");
    ssh.connect({
      host: info[1],
      username: info[0],
      privateKey: fs.readFileSync(process.env.PATH_PRIVATEKEY),
    });
  } else {
    await bot.sendMessage(CHAT_ID, `${sv} is not valid`, {
      disable_web_page_preview: true,
      protect_content: true,
    });
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

// Add the new command handler for /bgmi
bot.onText(/\/bgmi (.+)/, async (msg, match) => {
  const o = await checkOwner(msg);
  if (!o) {
    return;
  }
  if (!current) {
    await bot.sendMessage(
      CHAT_ID,
      `No server now, please connect one server before next.`
    );
    return;
  }
  const command = match[1].trim();
  // Example command: bgmi ip port time thread
  // Extract parameters
  const [ip, port, time, thread] = command.split(' ');

  // Construct the command to execute on the server
  const bgmiCommand = `./bgmi ${ip} ${port} ${time} ${thread}`;

  // Execute the command on the SSH server
  const ping = await bot.sendMessage(CHAT_ID, `Executing command: ${bgmiCommand}`);
  try {
    sshExcute(bgmiCommand, ping);
  } catch (error) {
    console.log(error);
    await bot.editMessageText(`Error: ${JSON.stringify(error, null, 2)}`, {
      message_id: ping.message_id,
      chat_id: ping.chat.id,
    });
  }
});

// helper
function isBotCommand(message) {
  if (!message || !message.entities) {
    return false;
  }
  const botCommands = message.entities.filter(
    (entity) => entity.type === "bot_command"
  );
  return botCommands.length > 0;
}
