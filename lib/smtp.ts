import tls from "tls";

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  fromEmail: string;
  fromName?: string;
}

const CRLF = "\r\n";

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (value == null) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function formatAddress(email: string, name?: string) {
  if (!name?.trim()) return `<${email}>`;
  const sanitizedName = name.replace(/[\r\n"]/g, "").trim();
  return `"${sanitizedName}" <${email}>`;
}

function toBase64(value: string) {
  return Buffer.from(value, "utf-8").toString("base64");
}

async function readResponse(socket: tls.TLSSocket): Promise<{ code: number; text: string }> {
  return await new Promise((resolve, reject) => {
    let buffer = "";

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split(CRLF).filter(Boolean);
      const lastLine = lines[lines.length - 1];

      if (!lastLine || lastLine.length < 4) {
        return;
      }

      const statusPrefix = lastLine.slice(0, 4);
      const isFinalLine = /^\d{3}\s/.test(statusPrefix);
      if (!isFinalLine) {
        return;
      }

      cleanup();
      resolve({ code: Number(lastLine.slice(0, 3)), text: buffer.trim() });
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      reject(new Error("Conexão SMTP encerrada inesperadamente"));
    };

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    };

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
  });
}

async function sendCommand(socket: tls.TLSSocket, command: string, expectedCodes: number[]) {
  socket.write(`${command}${CRLF}`);
  const response = await readResponse(socket);

  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP falhou em \"${command}\": ${response.text}`);
  }

  return response;
}

export async function sendSmtpMail({ to, subject, html, fromEmail, fromName }: SendMailOptions) {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || "465");
  const secure = parseBoolean(process.env.SMTP_SECURE, true);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP não configurado: defina SMTP_HOST, SMTP_USER e SMTP_PASS.");
  }

  if (!secure) {
    throw new Error("Atualmente o envio SMTP suporta apenas conexão segura (SMTP_SECURE=true). ");
  }

  const socket = tls.connect({ host, port, servername: host });

  await new Promise<void>((resolve, reject) => {
    socket.once("secureConnect", () => resolve());
    socket.once("error", (error) => reject(error));
  });

  try {
    await readResponse(socket);

    await sendCommand(socket, `EHLO ${host}`, [250]);
    await sendCommand(socket, "AUTH LOGIN", [334]);
    await sendCommand(socket, toBase64(user), [334]);
    await sendCommand(socket, toBase64(pass), [235]);
    await sendCommand(socket, `MAIL FROM:<${fromEmail}>`, [250]);
    await sendCommand(socket, `RCPT TO:<${to}>`, [250, 251]);
    await sendCommand(socket, "DATA", [354]);

    const fromHeader = formatAddress(fromEmail, fromName);
    const message = [
      `From: ${fromHeader}`,
      `To: <${to}>`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      html,
      ".",
    ].join(CRLF);

    socket.write(`${message}${CRLF}`);
    const dataResponse = await readResponse(socket);
    if (![250].includes(dataResponse.code)) {
      throw new Error(`SMTP falhou ao enviar DATA: ${dataResponse.text}`);
    }

    await sendCommand(socket, "QUIT", [221]);
  } finally {
    socket.end();
  }
}
