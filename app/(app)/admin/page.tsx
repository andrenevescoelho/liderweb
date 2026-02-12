"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Users,
  Music,
  ListMusic,
  Calendar,
  Search,
  UserPlus,
  Shield,
  UserCog,
  CreditCard,
  Crown,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SessionUser } from "@/lib/types";

interface Group {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  _count: {
    users: number;
    songs: number;
    setlists: number;
    schedules: number;
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  groupId: string | null;
  group: {
    id: string;
    name: string;
  } | null;
  profile: {
    phone: string | null;
    instruments: string[];
    active: boolean;
  } | null;
}

type TabType = "groups" | "users" | "subscriptions";

interface SubscriptionData {
  id: string;
  status: string;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  group: {
    id: string;
    name: string;
    _count: { users: number };
  };
  plan: {
    id: string;
    name: string;
    price: number;
    userLimit: number;
  };
}

interface GroupWithoutSub {
  id: string;
  name: string;
  _count: { users: number };
}

interface SubscriptionsResponse {
  subscriptions: SubscriptionData[];
  groupsWithoutSubscription: GroupWithoutSub[];
  stats: {
    total: number;
    active: number;
    trialing: number;
    canceled: number;
    pastDue: number;
    noSubscription: number;
  };
}

const ROLES = [
  { value: "SUPERADMIN", label: "SuperAdmin" },
  { value: "ADMIN", label: "Admin" },
  { value: "LEADER", label: "Líder" },
  { value: "MEMBER", label: "Membro" },
];

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  userLimit: number;
}

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Ativo" },
  { value: "TRIALING", label: "Período de Teste" },
  { value: "PAST_DUE", label: "Pagamento Pendente" },
  { value: "CANCELED", label: "Cancelado" },
  { value: "INACTIVE", label: "Inativo" },
];

export default function AdminPage() {
  const { data: session, status } = useSession() || {};
  const sessionUser = session?.user as SessionUser | undefined;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("groups");

  // Groups state
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "MEMBER",
    groupId: "",
  });

  // Subscriptions state
  const [subscriptionsData, setSubscriptionsData] = useState<SubscriptionsResponse | null>(null);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(true);
  const [subscriptionFilter, setSubscriptionFilter] = useState("all");
  const [availablePlans, setAvailablePlans] = useState<SubscriptionPlan[]>([]);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<SubscriptionData | null>(null);
  const [selectedGroupForSub, setSelectedGroupForSub] = useState<GroupWithoutSub | null>(null);
  const [subscriptionForm, setSubscriptionForm] = useState({
    planId: "",
    status: "ACTIVE",
    extendDays: 0,
  });

  useEffect(() => {
    if (status === "loading") return;
    if (!sessionUser || sessionUser.role !== "SUPERADMIN") {
      router.push("/dashboard");
      return;
    }
    fetchGroups();
    fetchUsers();
    fetchSubscriptions();
    fetchPlans();
  }, [session, status, router, sessionUser]);

  const fetchPlans = async () => {
    try {
      const res = await fetch("/api/subscription/manage");
      if (res.ok) {
        const data = await res.json();
        setAvailablePlans(data);
      }
    } catch (error) {
      console.error("Erro ao buscar planos:", error);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await fetch("/api/groups");
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
      }
    } catch (error) {
      console.error("Erro ao buscar grupos:", error);
    } finally {
      setLoadingGroups(false);
    }
  };

  const fetchUsers = async (search?: string) => {
    try {
      setLoadingUsers(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Erro ao buscar usuários:", error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchSubscriptions = async (status?: string) => {
    try {
      setLoadingSubscriptions(true);
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      const res = await fetch(`/api/subscription/all?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSubscriptionsData(data);
      }
    } catch (error) {
      console.error("Erro ao buscar assinaturas:", error);
    } finally {
      setLoadingSubscriptions(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "success" | "info" | "warning" | "danger" | "default"> = {
      ACTIVE: "success",
      TRIALING: "info",
      PAST_DUE: "warning",
      CANCELED: "danger",
      UNPAID: "danger",
      INACTIVE: "default",
    };
    const labels: Record<string, string> = {
      ACTIVE: "Ativo",
      TRIALING: "Período de Teste",
      PAST_DUE: "Pagamento Pendente",
      CANCELED: "Cancelado",
      UNPAID: "Não Pago",
      INACTIVE: "Inativo",
    };
    return <Badge variant={variants[status] || "default"}>{labels[status] || status}</Badge>;
  };

  // Group handlers
  const handleOpenGroupModal = (group?: Group) => {
    if (group) {
      setEditingGroup(group);
      setGroupForm({
        name: group.name,
        description: group.description || "",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
      });
    } else {
      setEditingGroup(null);
      setGroupForm({
        name: "",
        description: "",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
      });
    }
    setShowGroupModal(true);
  };

  const handleSaveGroup = async () => {
    try {
      if (editingGroup) {
        const res = await fetch(`/api/groups/${editingGroup.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: groupForm.name,
            description: groupForm.description,
          }),
        });
        if (!res.ok) throw new Error("Erro ao atualizar grupo");
      } else {
        const payload: any = {
          name: groupForm.name,
          description: groupForm.description,
        };
        if (groupForm.adminEmail && groupForm.adminPassword) {
          payload.adminName = groupForm.adminName || groupForm.name + " Admin";
          payload.adminEmail = groupForm.adminEmail;
          payload.adminPassword = groupForm.adminPassword;
        }
        const res = await fetch("/api/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Erro ao criar grupo");
      }
      setShowGroupModal(false);
      fetchGroups();
      fetchUsers();
    } catch (error) {
      console.error("Erro ao salvar grupo:", error);
      alert("Erro ao salvar grupo");
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este grupo? Todos os dados associados serão perdidos.")) return;
    try {
      const res = await fetch(`/api/groups/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir grupo");
      fetchGroups();
      fetchUsers();
    } catch (error) {
      console.error("Erro ao excluir grupo:", error);
      alert("Erro ao excluir grupo");
    }
  };

  // User handlers
  const handleOpenUserModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setUserForm({
        name: user.name,
        email: user.email,
        password: "",
        role: user.role,
        groupId: user.groupId || "",
      });
    } else {
      setEditingUser(null);
      setUserForm({
        name: "",
        email: "",
        password: "",
        role: "MEMBER",
        groupId: "",
      });
    }
    setShowUserModal(true);
  };

  const handleSaveUser = async () => {
    try {
      // SUPERADMIN não pertence a grupo
      const finalGroupId = userForm.role === "SUPERADMIN" ? null : (userForm.groupId || null);
      
      if (editingUser) {
        const payload: any = {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          groupId: finalGroupId,
        };
        if (userForm.password) {
          payload.password = userForm.password;
        }
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Erro ao atualizar usuário");
        }
      } else {
        if (!userForm.password) {
          alert("Senha é obrigatória para novos usuários");
          return;
        }
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: userForm.name,
            email: userForm.email,
            password: userForm.password,
            role: userForm.role,
            groupId: finalGroupId,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Erro ao criar usuário");
        }
      }
      setShowUserModal(false);
      fetchUsers(userSearch);
      fetchGroups();
    } catch (error: any) {
      console.error("Erro ao salvar usuário:", error);
      alert(error.message || "Erro ao salvar usuário");
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este usuário?")) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao excluir usuário");
      }
      fetchUsers(userSearch);
      fetchGroups();
    } catch (error: any) {
      console.error("Erro ao excluir usuário:", error);
      alert(error.message || "Erro ao excluir usuário");
    }
  };

  // Subscription handlers
  const handleOpenAddSubscription = (group: GroupWithoutSub) => {
    setSelectedGroupForSub(group);
    setEditingSubscription(null);
    setSubscriptionForm({
      planId: availablePlans[0]?.id || "",
      status: "ACTIVE",
      extendDays: 0,
    });
    setShowSubscriptionModal(true);
  };

  const handleOpenEditSubscription = (subscription: SubscriptionData) => {
    setEditingSubscription(subscription);
    setSelectedGroupForSub(null);
    setSubscriptionForm({
      planId: subscription.plan.id,
      status: subscription.status,
      extendDays: 0,
    });
    setShowSubscriptionModal(true);
  };

  const handleSaveSubscription = async () => {
    try {
      if (editingSubscription) {
        // Atualizar assinatura existente
        const res = await fetch("/api/subscription/manage", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscriptionId: editingSubscription.id,
            planId: subscriptionForm.planId,
            status: subscriptionForm.status,
            extendDays: subscriptionForm.extendDays > 0 ? subscriptionForm.extendDays : undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Erro ao atualizar assinatura");
        }
      } else if (selectedGroupForSub) {
        // Criar nova assinatura
        const res = await fetch("/api/subscription/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId: selectedGroupForSub.id,
            planId: subscriptionForm.planId,
            status: subscriptionForm.status,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Erro ao criar assinatura");
        }
      }
      setShowSubscriptionModal(false);
      fetchSubscriptions(subscriptionFilter);
    } catch (error: any) {
      console.error("Erro ao salvar assinatura:", error);
      alert(error.message || "Erro ao salvar assinatura");
    }
  };

  const handleDeleteSubscription = async (subscriptionId: string) => {
    if (!confirm("Tem certeza que deseja remover esta assinatura? O grupo perderá acesso às funcionalidades.")) return;
    try {
      const res = await fetch("/api/subscription/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao remover assinatura");
      }
      fetchSubscriptions(subscriptionFilter);
    } catch (error: any) {
      console.error("Erro ao remover assinatura:", error);
      alert(error.message || "Erro ao remover assinatura");
    }
  };

  const getRoleBadge = (role: string) => {
    const variants: Record<string, "default" | "success" | "warning" | "info"> = {
      SUPERADMIN: "default",
      ADMIN: "success",
      LEADER: "warning",
      MEMBER: "info",
    };
    const labels: Record<string, string> = {
      SUPERADMIN: "SuperAdmin",
      ADMIN: "Admin",
      LEADER: "Líder",
      MEMBER: "Membro",
    };
    return <Badge variant={variants[role] || "default"}>{labels[role] || role}</Badge>;
  };

  if (status === "loading" || loadingGroups) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Administração
          </h1>
          <p className="text-muted-foreground">Gerencie grupos e usuários do sistema</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab("groups")}
            className={`pb-2 px-1 font-medium transition-colors border-b-2 whitespace-nowrap ${
              activeTab === "groups"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="h-4 w-4 inline-block mr-2" />
            Grupos ({groups.length})
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`pb-2 px-1 font-medium transition-colors border-b-2 whitespace-nowrap ${
              activeTab === "users"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="h-4 w-4 inline-block mr-2" />
            Usuários ({users.length})
          </button>
          <button
            onClick={() => setActiveTab("subscriptions")}
            className={`pb-2 px-1 font-medium transition-colors border-b-2 whitespace-nowrap ${
              activeTab === "subscriptions"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <CreditCard className="h-4 w-4 inline-block mr-2" />
            Assinaturas ({subscriptionsData?.stats?.total ?? 0})
          </button>
        </nav>
      </div>

      {/* Groups Tab */}
      {activeTab === "groups" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => handleOpenGroupModal()}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Grupo
            </Button>
          </div>

          {groups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum grupo cadastrado</p>
                <p className="text-sm">Crie o primeiro grupo para começar</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => {
                const admin = group.users.find((u) => u.role === "ADMIN");
                return (
                  <Card key={group.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            {group.name}
                          </CardTitle>
                          {group.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {group.description}
                            </p>
                          )}
                        </div>
                        <Badge variant={group.active ? "success" : "danger"}>
                          {group.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Users className="h-4 w-4" />
                          {group._count.users} membros
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Music className="h-4 w-4" />
                          {group._count.songs} músicas
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <ListMusic className="h-4 w-4" />
                          {group._count.setlists} setlists
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {group._count.schedules} escalas
                        </div>
                      </div>
                      {admin && (
                        <div className="text-sm border-t pt-2">
                          <span className="text-muted-foreground">Admin:</span>{" "}
                          <span className="font-medium">{admin.name}</span>
                        </div>
                      )}
                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleOpenGroupModal(group)}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDeleteGroup(group.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  fetchUsers(e.target.value);
                }}
                className="pl-10"
              />
            </div>
            <Button onClick={() => handleOpenUserModal()}>
              <UserPlus className="h-4 w-4 mr-2" />
              Novo Usuário
            </Button>
          </div>

          {loadingUsers ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : users.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum usuário encontrado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium">Nome</th>
                    <th className="text-left py-3 px-4 font-medium">Email</th>
                    <th className="text-left py-3 px-4 font-medium">Função</th>
                    <th className="text-left py-3 px-4 font-medium">Grupo</th>
                    <th className="text-right py-3 px-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">
                              {user.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium">{user.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{user.email}</td>
                      <td className="py-3 px-4">{getRoleBadge(user.role)}</td>
                      <td className="py-3 px-4">
                        {user.group ? (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {user.group.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2 justify-end">
                          {user.id !== sessionUser?.id && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenUserModal(user)}
                                title="Editar usuário"
                              >
                                <UserCog className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteUser(user.id)}
                                title="Excluir usuário"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                          {user.id === sessionUser?.id && (
                            <span className="text-xs text-muted-foreground italic">Você</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Subscriptions Tab */}
      {activeTab === "subscriptions" && (
        <div className="space-y-6">
          {/* Stats Cards */}
          {subscriptionsData?.stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                <CardContent className="p-4 text-center">
                  <CheckCircle className="h-6 w-6 mx-auto mb-1 opacity-80" />
                  <p className="text-2xl font-bold">{subscriptionsData.stats.active}</p>
                  <p className="text-xs opacity-80">Ativos</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                <CardContent className="p-4 text-center">
                  <Clock className="h-6 w-6 mx-auto mb-1 opacity-80" />
                  <p className="text-2xl font-bold">{subscriptionsData.stats.trialing}</p>
                  <p className="text-xs opacity-80">Em Teste</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white">
                <CardContent className="p-4 text-center">
                  <AlertTriangle className="h-6 w-6 mx-auto mb-1 opacity-80" />
                  <p className="text-2xl font-bold">{subscriptionsData.stats.pastDue}</p>
                  <p className="text-xs opacity-80">Pag. Pendente</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
                <CardContent className="p-4 text-center">
                  <XCircle className="h-6 w-6 mx-auto mb-1 opacity-80" />
                  <p className="text-2xl font-bold">{subscriptionsData.stats.canceled}</p>
                  <p className="text-xs opacity-80">Cancelados</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-gray-500 to-gray-600 text-white">
                <CardContent className="p-4 text-center">
                  <Building2 className="h-6 w-6 mx-auto mb-1 opacity-80" />
                  <p className="text-2xl font-bold">{subscriptionsData.stats.noSubscription}</p>
                  <p className="text-xs opacity-80">Sem Plano</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                <CardContent className="p-4 text-center">
                  <Crown className="h-6 w-6 mx-auto mb-1 opacity-80" />
                  <p className="text-2xl font-bold">{subscriptionsData.stats.total}</p>
                  <p className="text-xs opacity-80">Total</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {["all", "ACTIVE", "TRIALING", "PAST_DUE", "CANCELED"].map((status) => (
              <Button
                key={status}
                variant={subscriptionFilter === status ? "primary" : "outline"}
                size="sm"
                onClick={() => {
                  setSubscriptionFilter(status);
                  fetchSubscriptions(status);
                }}
              >
                {status === "all" ? "Todos" : 
                 status === "ACTIVE" ? "Ativos" :
                 status === "TRIALING" ? "Em Teste" :
                 status === "PAST_DUE" ? "Pag. Pendente" : "Cancelados"}
              </Button>
            ))}
          </div>

          {loadingSubscriptions ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              {/* Subscriptions Table */}
              {(subscriptionsData?.subscriptions?.length ?? 0) > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Grupos com Assinatura
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-3 px-4 font-medium">Grupo</th>
                            <th className="text-left py-3 px-4 font-medium">Plano</th>
                            <th className="text-left py-3 px-4 font-medium">Status</th>
                            <th className="text-left py-3 px-4 font-medium">Usuários</th>
                            <th className="text-left py-3 px-4 font-medium">Próx. Cobrança</th>
                            <th className="text-right py-3 px-4 font-medium">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subscriptionsData?.subscriptions?.map((sub) => (
                            <tr key={sub.id} className="border-b border-border hover:bg-muted/50">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">{sub.group?.name}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <Crown className="h-4 w-4 text-yellow-500" />
                                  <span>{sub.plan?.name}</span>
                                  <span className="text-sm text-muted-foreground">
                                    R${sub.plan?.price?.toFixed(2).replace(".", ",")}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  {getStatusBadge(sub.status)}
                                  {sub.cancelAtPeriodEnd && (
                                    <span className="text-xs text-red-500">(Cancelamento agendado)</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <span className={`font-medium ${
                                  sub.plan?.userLimit > 0 && sub.group?._count?.users >= sub.plan?.userLimit
                                    ? "text-red-500"
                                    : ""
                                }`}>
                                  {sub.group?._count?.users} / {sub.plan?.userLimit === 0 ? "∞" : sub.plan?.userLimit}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-muted-foreground">
                                {sub.status === "TRIALING" && sub.trialEndsAt ? (
                                  <span className="text-blue-500">
                                    Teste até {format(new Date(sub.trialEndsAt), "dd/MM/yyyy")}
                                  </span>
                                ) : sub.currentPeriodEnd ? (
                                  format(new Date(sub.currentPeriodEnd), "dd/MM/yyyy")
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex gap-2 justify-end">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenEditSubscription(sub)}
                                    title="Editar assinatura"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteSubscription(sub.id)}
                                    title="Remover assinatura"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Groups without subscription */}
              {(subscriptionsData?.groupsWithoutSubscription?.length ?? 0) > 0 && subscriptionFilter === "all" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="h-5 w-5" />
                      Grupos sem Assinatura
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {subscriptionsData?.groupsWithoutSubscription?.map((group) => (
                        <div
                          key={group.id}
                          className="p-4 rounded-lg border border-dashed border-border bg-muted/30"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{group.name}</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenAddSubscription(group)}
                              title="Adicionar assinatura"
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Assinar
                            </Button>
                          </div>
                          <p className="text-sm text-muted-foreground mt-2">
                            {group._count?.users} usuários
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {(subscriptionsData?.subscriptions?.length ?? 0) === 0 && 
               (subscriptionsData?.groupsWithoutSubscription?.length ?? 0) === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma assinatura encontrada</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Group Modal */}
      <Modal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        title={editingGroup ? "Editar Grupo" : "Novo Grupo"}
      >
        <div className="space-y-4">
          <Input
            label="Nome do Grupo *"
            value={groupForm.name}
            onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
            placeholder="Ex: Igreja Batista Central"
          />
          <Input
            label="Descrição"
            value={groupForm.description}
            onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
            placeholder="Descrição do grupo"
          />
          {!editingGroup && (
            <>
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Criar Admin do Grupo (opcional)
                </h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Crie um usuário administrador para gerenciar este grupo
                </p>
                <div className="space-y-3">
                  <Input
                    label="Nome do Admin"
                    value={groupForm.adminName}
                    onChange={(e) => setGroupForm({ ...groupForm, adminName: e.target.value })}
                    placeholder="Nome do administrador"
                  />
                  <Input
                    label="Email do Admin"
                    type="email"
                    value={groupForm.adminEmail}
                    onChange={(e) => setGroupForm({ ...groupForm, adminEmail: e.target.value })}
                    placeholder="admin@exemplo.com"
                  />
                  <Input
                    label="Senha do Admin"
                    type="password"
                    value={groupForm.adminPassword}
                    onChange={(e) => setGroupForm({ ...groupForm, adminPassword: e.target.value })}
                    placeholder="Senha para o admin"
                  />
                </div>
              </div>
            </>
          )}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowGroupModal(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleSaveGroup} className="flex-1" disabled={!groupForm.name}>
              {editingGroup ? "Salvar" : "Criar Grupo"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* User Modal */}
      <Modal
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
        title={editingUser ? "Editar Usuário" : "Novo Usuário"}
      >
        <div className="space-y-4">
          <Input
            label="Nome *"
            value={userForm.name}
            onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
            placeholder="Nome completo"
          />
          <Input
            label="Email *"
            type="email"
            value={userForm.email}
            onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
            placeholder="email@exemplo.com"
          />
          <Input
            label={editingUser ? "Nova Senha (deixe em branco para manter)" : "Senha *"}
            type="password"
            value={userForm.password}
            onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            placeholder={editingUser ? "Nova senha" : "Senha"}
          />
          <Select
            label="Função *"
            value={userForm.role}
            onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
            options={ROLES}
          />
          {userForm.role === "SUPERADMIN" ? (
            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <p className="text-sm text-purple-600 dark:text-purple-400">
                <Shield className="h-4 w-4 inline-block mr-1" />
                <strong>SuperAdmin</strong> não pertence a nenhum grupo e tem acesso total ao sistema.
              </p>
            </div>
          ) : (
            <>
              <Select
                label="Grupo"
                value={userForm.groupId}
                onChange={(e) => setUserForm({ ...userForm, groupId: e.target.value })}
                options={[
                  { value: "", label: "Sem grupo" },
                  ...groups.map((g) => ({ value: g.id, label: g.name })),
                ]}
              />
              {userForm.groupId && userForm.role === "ADMIN" && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    <Shield className="h-4 w-4 inline-block mr-1" />
                    Este usuário será <strong>Administrador</strong> do grupo selecionado e poderá gerenciar membros, músicas e escalas.
                  </p>
                </div>
              )}
            </>
          )}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowUserModal(false)} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleSaveUser}
              className="flex-1"
              disabled={!userForm.name || !userForm.email || (!editingUser && !userForm.password)}
            >
              {editingUser ? "Salvar" : "Criar Usuário"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Subscription Modal */}
      <Modal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        title={editingSubscription ? "Editar Assinatura" : "Adicionar Assinatura"}
      >
        <div className="space-y-4">
          {/* Grupo info */}
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Grupo:</p>
            <p className="font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {editingSubscription?.group?.name || selectedGroupForSub?.name}
            </p>
          </div>

          <Select
            label="Plano *"
            value={subscriptionForm.planId}
            onChange={(e) => setSubscriptionForm({ ...subscriptionForm, planId: e.target.value })}
            options={availablePlans.map((p) => ({
              value: p.id,
              label: `${p.name} - R$${p.price.toFixed(2).replace(".", ",")} (${p.userLimit === 0 ? "ilimitado" : `até ${p.userLimit} usuários`})`,
            }))}
          />

          <Select
            label="Status *"
            value={subscriptionForm.status}
            onChange={(e) => setSubscriptionForm({ ...subscriptionForm, status: e.target.value })}
            options={STATUS_OPTIONS}
          />

          {editingSubscription && (
            <Input
              label="Estender período (dias)"
              type="number"
              min={0}
              value={subscriptionForm.extendDays}
              onChange={(e) => setSubscriptionForm({ ...subscriptionForm, extendDays: parseInt(e.target.value) || 0 })}
              placeholder="0"
            />
          )}

          {subscriptionForm.status === "CANCELED" && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 inline-block mr-1" />
                Ao cancelar, o grupo perderá acesso às funcionalidades após o período atual.
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowSubscriptionModal(false)} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleSaveSubscription}
              className="flex-1"
              disabled={!subscriptionForm.planId}
            >
              {editingSubscription ? "Salvar Alterações" : "Adicionar Assinatura"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
