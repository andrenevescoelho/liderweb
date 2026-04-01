"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleHelp, Search } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FaqCategory {
  id: string;
  slug: string;
  name: string;
}

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  category: FaqCategory;
}

const ALL_CATEGORIES = "all";

export default function FaqPage() {
  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const fetchFaq = async () => {
      try {
        setLoading(true);
        setError("");

        const params = new URLSearchParams();
        if (activeCategory !== ALL_CATEGORIES) params.set("category", activeCategory);
        if (search) params.set("search", search);

        const response = await fetch(`/api/faq?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Não foi possível carregar o FAQ");
        }

        setCategories(data.categories ?? []);
        setItems(data.items ?? []);
      } catch (err: any) {
        setError(err.message || "Não foi possível carregar o FAQ");
      } finally {
        setLoading(false);
      }
    };

    fetchFaq();
  }, [activeCategory, search]);

  const groupedItems = useMemo(() => {
    return items.reduce<Record<string, FaqItem[]>>((acc, item) => {
      const key = item.category.name;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
          <CircleHelp className="h-5 w-5 text-blue-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">FAQ Liderweb</h1>
          <p className="text-sm text-muted-foreground">Encontre respostas rápidas sobre funcionalidades e uso da plataforma.</p>
        </div>
      </div>

      <div className="rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por dúvida, palavra-chave ou recurso..."
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={activeCategory === ALL_CATEGORIES ? "default" : "outline"}
            onClick={() => setActiveCategory(ALL_CATEGORIES)}
          >
            Todas
          </Button>
          {categories.map((category) => (
            <Button
              key={category.id}
              type="button"
              variant={activeCategory === category.slug ? "default" : "outline"}
              onClick={() => setActiveCategory(category.slug)}
            >
              {category.name}
            </Button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando FAQ...</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border p-6 text-center text-slate-500">
          Nenhum resultado encontrado para os filtros selecionados.
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-4">
          {Object.entries(groupedItems).map(([categoryName, categoryItems]) => (
            <section key={categoryName} className="rounded-xl border bg-white dark:bg-slate-900 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">{categoryName}</h2>
              <Accordion type="single" collapsible className="w-full">
                {categoryItems.map((item) => (
                  <AccordionItem key={item.id} value={item.id}>
                    <AccordionTrigger className="text-left">{item.question}</AccordionTrigger>
                    <AccordionContent>
                      <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{item.answer}</p>
                      {item.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.tags.map((tag) => (
                            <span key={`${item.id}-${tag}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
