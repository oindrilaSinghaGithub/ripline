import Link from "next/link";
import { ArrowRight, Zap, Shield, Users, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";

const features = [
  {
    icon: Zap,
    title: "Lightning fast",
    description:
      "Built on Next.js 15 and Aurora PostgreSQL for sub-100ms responses at any scale.",
  },
  {
    icon: Shield,
    title: "Enterprise security",
    description:
      "SOC 2 Type II compliant with role-based access control and audit logging out of the box.",
  },
  {
    icon: Users,
    title: "Team workspaces",
    description:
      "Invite your team, set granular permissions, and collaborate without friction.",
  },
  {
    icon: BarChart3,
    title: "Actionable analytics",
    description:
      "Real-time dashboards give every stakeholder the visibility they need.",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    description: "Perfect for individuals and small experiments.",
    features: ["1 workspace", "Up to 3 members", "5 GB storage", "Community support"],
    cta: "Get started free",
    href: "/register",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    description: "Everything you need to scale a growing team.",
    features: [
      "Unlimited workspaces",
      "Unlimited members",
      "100 GB storage",
      "Priority support",
      "Advanced analytics",
    ],
    cta: "Start free trial",
    href: "/register?plan=pro",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "Tailored for large organisations with complex requirements.",
    features: [
      "Everything in Pro",
      "SSO / SAML",
      "Dedicated infrastructure",
      "SLA guarantee",
      "Custom contracts",
    ],
    cta: "Contact sales",
    href: "/contact",
    highlighted: false,
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingNav />

      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <Badge variant="secondary" className="mb-6">
          Now in public beta
        </Badge>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          The workspace platform built for{" "}
          <span className="text-primary">modern teams</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Ripline brings your work, your people, and your data into one fast,
          secure, and beautifully simple place.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button size="lg" asChild>
            <Link href="/register">
              Get started free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="#features">See how it works</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t bg-muted/40 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Everything your team needs
            </h2>
            <p className="mt-4 text-muted-foreground">
              Stop stitching together a dozen tools. Ripline has it all.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.title} className="border-0 shadow-sm">
                <CardHeader>
                  <feature.icon className="h-8 w-8 text-primary" />
                  <CardTitle className="mt-4 text-base">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-muted-foreground">
              No surprises. Cancel any time.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={
                  plan.highlighted
                    ? "border-primary shadow-lg ring-1 ring-primary"
                    : ""
                }
              >
                <CardHeader>
                  {plan.highlighted && (
                    <Badge className="mb-2 w-fit">Most popular</Badge>
                  )}
                  <CardTitle>{plan.name}</CardTitle>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    {plan.price !== "Custom" && (
                      <span className="text-muted-foreground">/mo</span>
                    )}
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={plan.highlighted ? "default" : "outline"}
                    asChild
                  >
                    <Link href={plan.href}>{plan.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
