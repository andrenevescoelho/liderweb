"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ShoppingCart, Trash2, Loader2, Music2, ArrowLeft, CreditCard, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface CartItem {
  id: string;
  quantity: number;
  unitPrice: number;
  metadata: Record<string, any>;
  product: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    type: string;
    price: number;
  };
}

interface Cart {
  id: string;
  items: CartItem[];
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  MULTITRACK_RENTAL: "Aluguel de Multitrack",
  SPLIT_REQUEST: "Solicitação de Split",
  SPLIT_ACCESS: "Acesso a Split",
  MODULE_ACCESS: "Acesso a Módulo",
  ADDON: "Add-on",
};

export default function CartPage() {
  const router = useRouter();
  const { status } = useSession() || {};

  const [cart, setCart] = useState<Cart | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const fetchCart = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/billing/cart");
      if (!res.ok) return;
      const data = await res.json();
      setCart(data.cart);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("Erro ao carregar carrinho");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchCart();
  }, [status, fetchCart]);

  const handleRemove = async (productId: string) => {
    setRemoving(productId);
    try {
      const res = await fetch("/api/billing/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", productId }),
      });
      if (!res.ok) { toast.error("Erro ao remover item"); return; }
      await fetchCart();
    } catch {
      toast.error("Erro ao remover item");
    } finally {
      setRemoving(null);
    }
  };

  const handleCheckout = async () => {
    setCheckingOut(true);
    try {
      const res = await fetch("/api/billing/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkout" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao iniciar checkout");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Checkout não retornou URL");
      }
    } catch {
      toast.error("Erro ao processar pagamento");
    } finally {
      setCheckingOut(false);
    }
  };

  const handleClear = async () => {
    try {
      await fetch("/api/billing/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      await fetchCart();
    } catch {
      toast.error("Erro ao limpar carrinho");
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const items = cart?.items ?? [];
  const isEmpty = items.length === 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" /> Carrinho
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEmpty ? "Seu carrinho está vazio" : `${items.length} ${items.length === 1 ? "item" : "itens"}`}
          </p>
        </div>
      </div>

      {isEmpty ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ShoppingCart className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">Nenhum item no carrinho.</p>
            <Button onClick={() => router.push("/multitracks")} variant="outline">
              <Music2 className="h-4 w-4 mr-2" /> Ver Multitracks
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Itens */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Itens</CardTitle>
              <Button variant="ghost" size="sm" onClick={handleClear}
                className="text-muted-foreground hover:text-red-500 text-xs">
                Limpar tudo
              </Button>
            </CardHeader>
            <CardContent className="divide-y divide-border/60 p-0">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 flex-shrink-0">
                    {item.product.type === "MULTITRACK_RENTAL" ? (
                      <Music2 className="h-5 w-5 text-primary" />
                    ) : (
                      <Package className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{item.product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {PRODUCT_TYPE_LABELS[item.product.type] ?? item.product.type}
                      {item.quantity > 1 && ` × ${item.quantity}`}
                    </p>
                    {item.metadata?.albumId && (
                      <p className="text-xs text-primary/70 mt-0.5">Track selecionada</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className="font-semibold text-sm">{formatBRL(item.unitPrice * item.quantity)}</p>
                    <Button variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                      onClick={() => handleRemove(item.product.id)}
                      disabled={removing === item.product.id}>
                      {removing === item.product.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Resumo */}
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal ({items.length} {items.length === 1 ? "item" : "itens"})</span>
                <span>{formatBRL(total)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t border-border/60 pt-3">
                <span>Total</span>
                <span className="text-primary">{formatBRL(total)}</span>
              </div>
              <Button className="w-full mt-2" size="lg" onClick={handleCheckout} disabled={checkingOut}>
                {checkingOut
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processando...</>
                  : <><CreditCard className="mr-2 h-4 w-4" />Finalizar pagamento</>}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Pagamento seguro via Stripe. Após o pagamento, as cotas são liberadas imediatamente.
              </p>
            </CardContent>
          </Card>

          {/* Adicionar mais */}
          <div className="text-center">
            <Button variant="outline" onClick={() => router.push("/multitracks")}>
              <Music2 className="h-4 w-4 mr-2" /> Adicionar mais multitracks
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
