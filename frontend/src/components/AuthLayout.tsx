import { Building2 } from "lucide-react";
import { ReactNode } from "react";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export default function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-white p-4 rounded-full shadow-lg">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-gray-600">{subtitle}</p>
        </div>

        <div className="bg-white shadow-xl border-0 rounded-lg p-4">
          {children}
        </div>

        <div className="text-center mt-8 text-sm text-gray-500">
          <p>ResidentHive © {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
}
