import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle2, Calendar, Users, Music, MessageCircle, GraduationCap, Layers } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white overflow-x-hidden">

      {/* ── Navbar ────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/8 bg-[#0a0f1e]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg border border-white/10 bg-white/5 p-1.5">
              <Image src="/favicon.svg" alt="LiderWeb" width={22} height={22} />
            </div>
            <span className="font-bold text-lg">LiderWeb</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              Entrar
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-[#1cc9a8] px-4 py-2 text-sm font-semibold text-[#0a0f1e] hover:bg-[#1bb89a] transition-colors"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-6xl px-6 pt-20 pb-24 text-center">
        {/* Glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[400px] w-[600px] rounded-full bg-[#1cc9a8]/10 blur-[120px]" />
        </div>

        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#1cc9a8]/30 bg-[#1cc9a8]/10 px-4 py-1.5 text-xs font-medium text-[#1cc9a8] mb-6">
            ✦ Para ministérios de louvor
          </span>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
            Organize, treine e{" "}
            <span className="text-[#1cc9a8]">eleve o nível</span>{" "}
            do seu ministério.
          </h1>

          <p className="mt-6 text-lg text-white/60 max-w-2xl mx-auto leading-relaxed">
            Chega de ensaios desorganizados, músicos despreparados e escalas confusas.
            O LiderWeb reúne tudo que seu ministério precisa em um só lugar.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="flex items-center gap-2 rounded-xl bg-[#1cc9a8] px-8 py-3.5 text-base font-bold text-[#0a0f1e] hover:bg-[#1bb89a] transition-all hover:scale-105 active:scale-95"
            >
              Começar grátis
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="text-sm text-white/50 hover:text-white transition-colors"
            >
              Já tenho conta →
            </Link>
          </div>

          <p className="mt-4 text-xs text-white/30">
            Grátis para começar · Sem cartão de crédito
          </p>
        </div>
      </section>

      {/* ── Dor ───────────────────────────────────────────────────────── */}
      <section className="border-y border-white/8 bg-white/2 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-white/30 mb-10">
            Seu ministério enfrenta isso?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { emoji: "😰", text: "Ninguém sabe quem vai tocar no domingo" },
              { emoji: "🎵", text: "Músicos chegam sem ter ensaiado as músicas" },
              { emoji: "📱", text: "Comunicação espalhada em vários grupos de WhatsApp" },
              { emoji: "📈", text: "Time não evolui, sempre os mesmos erros" },
            ].map((item, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/8 bg-white/3 p-5 text-center"
              >
                <span className="text-3xl mb-3 block">{item.emoji}</span>
                <p className="text-sm text-white/60 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solução ───────────────────────────────────────────────────── */}
      <section className="py-20 mx-auto max-w-6xl px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold">
            O LiderWeb resolve isso.
          </h2>
          <p className="mt-3 text-white/50 max-w-xl mx-auto">
            Ferramentas pensadas para a realidade do ministério gospel brasileiro.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              icon: <Calendar className="w-5 h-5" />,
              color: "text-[#1cc9a8] bg-[#1cc9a8]/10",
              title: "Escalas organizadas",
              desc: "Monte escalas em segundos. Com IA, o sistema sugere quem tocar em cada função baseado nos membros do seu ministério.",
            },
            {
              icon: <GraduationCap className="w-5 h-5" />,
              color: "text-purple-400 bg-purple-400/10",
              title: "Professor IA",
              desc: "Cada músico recebe orientações personalizadas baseadas na sua função. Vocal, guitarra, teclado — o Professor IA treina cada um.",
            },
            {
              icon: <Layers className="w-5 h-5" />,
              color: "text-blue-400 bg-blue-400/10",
              title: "Multitracks & Pads",
              desc: "Acesse multitracks de músicas gospel para ensaiar. Pads de adoração integrados para o culto ao vivo.",
            },
            {
              icon: <Music className="w-5 h-5" />,
              color: "text-pink-400 bg-pink-400/10",
              title: "Repertório inteligente",
              desc: "Cadastre músicas com tom, BPM e letra. A IA analisa e sugere o tom ideal para cada vocalista.",
            },
            {
              icon: <Users className="w-5 h-5" />,
              color: "text-amber-400 bg-amber-400/10",
              title: "Gestão da equipe",
              desc: "Perfis completos por membro, funções, disponibilidade e habilidades. Tudo centralizado.",
            },
            {
              icon: <MessageCircle className="w-5 h-5" />,
              color: "text-cyan-400 bg-cyan-400/10",
              title: "Comunicação unificada",
              desc: "Chat do grupo, mensagens diretas e comunicados. Nada mais de grupos de WhatsApp bagunçados.",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/8 bg-white/3 p-6 hover:border-white/15 hover:bg-white/5 transition-all"
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${item.color} mb-4`}>
                {item.icon}
              </div>
              <h3 className="font-semibold text-base mb-2">{item.title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Resultado ─────────────────────────────────────────────────── */}
      <section className="border-y border-white/8 bg-white/2 py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-8">
            Imagine seu ministério assim:
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            {[
              "Todos sabem sua escala com antecedência",
              "Músicos chegam preparados para o ensaio",
              "Comunicação clara e centralizada",
              "Time evoluindo semana a semana",
              "Líder com tempo para ministrar, não administrar",
              "Louvor alinhado e profissional",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#1cc9a8] flex-shrink-0" />
                <span className="text-sm text-white/70">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Final ─────────────────────────────────────────────────── */}
      <section className="py-24 mx-auto max-w-3xl px-6 text-center">
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[300px] w-[500px] rounded-full bg-[#1cc9a8]/8 blur-[100px]" />
          </div>
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold">
              Seu ministério merece isso.
            </h2>
            <p className="mt-4 text-white/50 max-w-lg mx-auto">
              Junte-se a centenas de ministérios que já usam o LiderWeb para louvar com excelência.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="flex items-center gap-2 rounded-xl bg-[#1cc9a8] px-8 py-3.5 text-base font-bold text-[#0a0f1e] hover:bg-[#1bb89a] transition-all hover:scale-105 active:scale-95"
              >
                Começar agora — é grátis
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <p className="mt-4 text-xs text-white/25">
              by multitrackgospel.com
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
