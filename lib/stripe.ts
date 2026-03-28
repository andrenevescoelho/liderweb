import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  typescript: true,
});

// Planos de assinatura
export const SUBSCRIPTION_PLANS = [
  {
    id: "free",
    name: "Gratuito",
    description: "Comece gratuitamente",
    price: 0,
    userLimit: 10,
    isFree: true,
    features: [
      "Até 10 membros",
      "Músicas e cifras",
      "Escalas ilimitadas",
      "Ensaios",
      "Chat do grupo",
    ],
  },
  {
    id: "basico",
    name: "Básico",
    description: "Para ministérios que querem crescer",
    price: 49.90,
    userLimit: 15,
    features: [
      "Até 15 membros",
      "Músicas e cifras",
      "Escalas ilimitadas",
      "Ensaios",
      "Chat do grupo",
    ],
  },
  {
    id: "intermediario",
    name: "Intermediário",
    description: "O mais escolhido",
    price: 89.90,
    userLimit: 30,
    popular: true,
    features: [
      "Até 30 membros",
      "Músicas e cifras",
      "Escalas ilimitadas",
      "Ensaios",
      "Chat do grupo",
      "Professor IA",
      "5 Multitracks/mês",
      "5 Splits/mês",
    ],
  },
  {
    id: "avancado",
    name: "Avançado",
    description: "Para igrejas em crescimento",
    price: 119.90,
    userLimit: 50,
    features: [
      "Até 50 membros",
      "Músicas e cifras",
      "Escalas ilimitadas",
      "Ensaios",
      "Chat do grupo",
      "Professor IA",
      "10 Multitracks/mês",
      "10 Splits/mês",
    ],
  },
  {
    id: "igreja",
    name: "Igreja",
    description: "Solução completa para igrejas",
    price: 199.90,
    userLimit: 80,
    features: [
      "Até 80 membros",
      "Músicas e cifras",
      "Escalas ilimitadas",
      "Ensaios",
      "Chat do grupo",
      "Professor IA",
      "20 Multitracks/mês",
      "20 Splits/mês",
    ],
  },
];
