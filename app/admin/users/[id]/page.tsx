import { AdminUserDetails } from "@/components/admin-user-details";

type UserDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminUserDetailsPage({ params }: UserDetailsPageProps) {
  const { id } = await params;
  return <AdminUserDetails userId={id} />;
}
