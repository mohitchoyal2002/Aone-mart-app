import React, { useState, useEffect } from "react";
import { View, Pressable, Alert } from "react-native";
import { Plus, Pencil, UserX, RotateCcw } from "lucide-react-native";
import { api } from "./api";
import { useAuth, useLoad, alertError } from "./state";
import {
  C,
  T,
  Button,
  Input,
  Select,
  SectionTitle,
  SearchInput,
  Chip,
  Loading,
  ErrorView,
  Empty,
  Sheet,
  Page,
  money,
  dateLabel,
} from "./ui";
import { NativeTable, Cell, TableRow, Pagination } from "./admin-common";
import type { User } from "./types";
export function CustomersScreen() {
  const { epoch, bump, user, logout } = useAuth();
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [deleted, setDeleted] = useState(false),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<User | null>(null),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState("customer"),
    [points, setPoints] = useState("0"),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query);
      setOffset(0);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);
  const result = useLoad<{ users: User[]; total: number }>(
    () =>
      api.get(
        `/api/admin/users?q=${encodeURIComponent(search)}&deleted=${deleted}&limit=30&offset=${offset}`,
      ),
    [search, deleted, offset, epoch],
  );
  const edit = (u: User | null) => {
    setEditing(u);
    setName(u?.name || "");
    setPhone(u?.phone || "");
    setPassword("");
    setRole(u?.role || "customer");
    setPoints(String(u?.points || 0));
    setReason("");
    setOpen(true);
  };
  const save = async () => {
    setBusy(true);
    try {
      if (editing) {
        await api.patch(`/api/admin/users/${editing.id}`, {
          name,
          phone,
          role,
          points: Number(points),
          ...(password ? { password } : {}),
          ...(reason ? { pointReason: reason } : {}),
        });
      } else
        await api.post("/api/admin/users", { name, phone, password, role });
      setOpen(false);
      bump();
      if (editing?.id === user?.id && (password || phone !== user?.phone)) {
        Alert.alert(
          "Account updated",
          "Please log in again with your updated credentials.",
        );
        await logout();
      }
    } catch (e) {
      alertError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = (u: User) =>
    Alert.alert(
      "Disable this account?",
      `${u.name} will lose access. Orders and invoices will remain in your records, and you can restore this account later.`,
      [
        { text: "Keep active", style: "cancel" },
        {
          text: "Disable account",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/api/admin/users/${u.id}`);
              bump();
            } catch (e) {
              alertError(e);
            }
          },
        },
      ],
    );
  const restore = async (u: User) => {
    try {
      await api.post(`/api/admin/users/${u.id}/restore`, {});
      bump();
    } catch (e) {
      alertError(e);
    }
  };
  return (
    <Page refresh={result.refresh} refreshing={result.loading && !!result.data}>
      <SectionTitle
        title="Customers & team"
        caption="Your neighbours, accounts and store access."
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
        <Button
          title="Create account"
          onPress={() => edit(null)}
          icon={<Plus size={16} color={C.white} />}
        />
        <Chip
          label="Active accounts"
          selected={!deleted}
          onPress={() => {
            setDeleted(false);
            setOffset(0);
          }}
        />
        <Chip
          label="Disabled accounts"
          selected={deleted}
          onPress={() => {
            setDeleted(true);
            setOffset(0);
          }}
        />
      </View>
      <SearchInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search customer name or phone..."
      />
      {result.error ? (
        <ErrorView error={result.error} retry={result.refresh} />
      ) : result.loading && !result.data ? (
        <Loading />
      ) : result.data?.users.length ? (
        <NativeTable
          headers={[
            "Name",
            "Phone / role",
            "Rewards",
            "Orders / spend",
            "Actions",
          ]}
          widths={[255, 185, 110, 145, 110]}
        >
          {result.data.users.map((u) => (
            <TableRow key={u.id}>
              <Cell width={255}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: C.mint,
                      borderRadius: 14,
                      width: 40,
                      height: 40,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <T bold size={17} color={C.forest}>
                      {u.name[0].toUpperCase()}
                    </T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T bold size={13}>
                      {u.name}
                    </T>
                    <T size={10} color={C.muted} style={{ marginTop: 4 }}>
                      Joined {dateLabel(u.createdAt)}
                    </T>
                  </View>
                </View>
              </Cell>
              <Cell width={185}>
                <T size={12}>{u.phone}</T>
                <T
                  size={10}
                  bold
                  color={u.role === "admin" ? C.blue : C.forest}
                  style={{ marginTop: 5, textTransform: "uppercase" }}
                >
                  {u.role}
                </T>
              </Cell>
              <Cell width={110}>
                <T bold size={16}>
                  {u.points}
                </T>
                <T size={10} color={C.muted}>
                  points
                </T>
              </Cell>
              <Cell width={145}>
                <T size={12}>{u.orders || 0} orders</T>
                <T size={11} color={C.muted} style={{ marginTop: 5 }}>
                  {money(u.spent || 0)}
                </T>
              </Cell>
              <Cell width={110}>
                <View style={{ flexDirection: "row", gap: 18 }}>
                  {deleted ? (
                    <Pressable
                      accessibilityLabel={`Restore ${u.name}`}
                      hitSlop={10}
                      onPress={() => void restore(u)}
                    >
                      <RotateCcw size={18} color={C.forest} />
                    </Pressable>
                  ) : (
                    <>
                      <Pressable
                        accessibilityLabel={`Edit ${u.name}`}
                        hitSlop={10}
                        onPress={() => edit(u)}
                      >
                        <Pencil size={17} color={C.forest} />
                      </Pressable>
                      {u.id !== user?.id && (
                        <Pressable
                          accessibilityLabel={`Disable ${u.name}`}
                          hitSlop={10}
                          onPress={() => remove(u)}
                        >
                          <UserX size={18} color={C.red} />
                        </Pressable>
                      )}
                    </>
                  )}
                </View>
              </Cell>
            </TableRow>
          ))}
        </NativeTable>
      ) : (
        <Empty
          title={deleted ? "No disabled accounts" : "No matching customers"}
          detail="Create an account or try a different search."
        />
      )}
      <Pagination
        total={result.data?.total || 0}
        offset={offset}
        onChange={setOffset}
      />
      <Sheet
        visible={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={editing ? "Update account" : "Create an account"}
      >
        <Input label="Full name" value={name} onChangeText={setName} />
        <Input
          label="Mobile number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={10}
        />
        <Select
          label="Access role"
          value={role}
          onChange={setRole}
          options={[
            { label: "Customer", value: "customer" },
            { label: "Admin / staff", value: "admin" },
          ]}
        />
        <Input
          label={editing ? "Reset password (optional)" : "Initial password"}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          placeholder="At least 8 characters"
        />
        {editing && (
          <>
            <Input
              label="Reward points balance"
              value={points}
              onChangeText={setPoints}
              keyboardType="number-pad"
            />
            {Number(points) !== editing.points && (
              <Input
                label="Reason for point adjustment"
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. Customer loyalty credit"
              />
            )}
          </>
        )}
        <Button
          title={editing ? "Save account" : "Create account"}
          onPress={save}
          loading={busy}
        />
      </Sheet>
    </Page>
  );
}
