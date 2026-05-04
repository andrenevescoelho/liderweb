// Validação e formatação de CPF e CNPJ
// Pode ser usado no frontend e no backend

/** Remove tudo que não for dígito */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Aplica máscara: CPF → 000.000.000-00 / CNPJ → 00.000.000/0000-00 */
export function maskDocument(value: string): string {
  const digits = onlyDigits(value);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** Máscara exibição segura (oculta dígitos do meio) */
export function maskDocumentSafe(raw: string): string {
  const d = onlyDigits(raw);
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/****-**`;
  return raw;
}

/** Valida CPF com algoritmo de dígitos verificadores */
export function validateCPF(cpf: string): boolean {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // todos iguais

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(d[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(d[10]);
}

/** Valida CNPJ com algoritmo de dígitos verificadores */
export function validateCNPJ(cnpj: string): boolean {
  const d = onlyDigits(cnpj);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const calcDigit = (nums: string, weights: number[]) => {
    const sum = nums.split("").reduce((acc, n, i) => acc + parseInt(n) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  if (calcDigit(d.slice(0, 12), w1) !== parseInt(d[12])) return false;
  if (calcDigit(d.slice(0, 13), w2) !== parseInt(d[13])) return false;
  return true;
}

/** Valida CPF ou CNPJ automaticamente pelo número de dígitos */
export function validateDocument(value: string): { valid: boolean; type: "CPF" | "CNPJ" | null } {
  const d = onlyDigits(value);
  if (d.length === 11) return { valid: validateCPF(d), type: "CPF" };
  if (d.length === 14) return { valid: validateCNPJ(d), type: "CNPJ" };
  return { valid: false, type: null };
}

/** Formata telefone brasileiro: (11) 99999-9999 */
export function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
