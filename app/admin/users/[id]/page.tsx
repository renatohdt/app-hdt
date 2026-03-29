import { AdminUserDetails } from "@/components/admin-user-details";

type UserDetailsPageProps = {
  params: {
    id: string;
  };
};

export default function AdminUserDetailsPage({ params }: UserDetailsPageProps) {
  return <AdminUserDetails userId={params.id} />;
}
