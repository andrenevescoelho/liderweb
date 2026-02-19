import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  typescript: true,
});

// Planos de assinatura
export const SUBSCRIPTION_PLANS = [
  {
    id: "free",
    name: "Gratuito",
    description: "Para conhecer a plataforma",
    price: 0,
    userLimit: 10,
    isFree: true,
    features: [
      "Até 10 usuários",
      "Músicas ilimitadas",
      "Repertórios ilimitados",
      "Escalas ilimitadas",
      "Suporte por email",
    ],
  },
  {
    id: "basico",
    name: "Básico",
    description: "Ideal para ministérios pequenos",
    price: 29.90,
    userLimit: 15,
    features: [
      "Até 15 usuários",
      "Músicas ilimitadas",
      "Repertórios ilimitados",
      "Escalas ilimitadas",
      "Upload de áudio",
      "Suporte por email",
    ],
  },
  {
    id: "intermediario",
    name: "Intermediário",
    description: "Para ministérios em crescimento",
    price: 49.90,
    userLimit: 30,
    popular: true,
    features: [
      "Até 30 usuários",
      "Músicas ilimitadas",
      "Repertórios ilimitados",
      "Escalas ilimitadas",
      "Upload de áudio",
      "Suporte prioritário",
    ],
  },
  {
    id: "avancado",
    name: "Avançado",
    description: "Para grandes ministérios",
    price: 99.90,
    userLimit: 100,
    features: [
      "Até 100 usuários",
      "Músicas ilimitadas",
      "Repertórios ilimitados",
      "Escalas ilimitadas",
      "Upload de áudio",
      "Suporte VIP",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Para igrejas com múltiplos ministérios",
    price: 149.90,
    userLimit: 0, // 0 = ilimitado
    features: [
      "Usuários ilimitados",
      "Músicas ilimitadas",
      "Repertórios ilimitados",
      "Escalas ilimitadas",
      "Upload de áudio",
      "Suporte dedicado",
      "Onboarding personalizado",
    ],
  },
];
