import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isBefore, isAfter, startOfDay, addDays } from "date-fns";
import {
  Landmark, Users, BookOpen, Zap, Newspaper, Plus, Pencil, Trash2, X, Check,
  ChevronDown, ChevronUp, Phone, Mail, Globe, Star, Vote, Calendar,
  CheckCircle2, Circle, ExternalLink, Tag, Search, Loader2, PlusCircle,
  DollarSign, MapPin, Clock, Users2, TrendingDown, Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  PoliticalOfficial, PoliticalIssue, PoliticalElection, CivicAction, PoliticalNewsSource,
  TabCollaborationWithUser,
} from "@shared/schema";

// ── Constants ──────────────────────────────────────────────────────────────────

const LEVELS = ["Federal", "State", "Local"];
const PARTIES = ["Democrat", "Republican", "Independent", "Green", "Libertarian", "Other"];
const POSITIONS = ["strongly_support","support","lean_support","neutral","lean_oppose","oppose","strongly_oppose"] as const;
const POSITION_META: Record<string, { label: string; short: string; score: number; badge: string; bar: string }> = {
  strongly_support: { label: "Strongly Support", short: "Strong ✓", score:  3, badge: "bg-emerald-600 text-white",                                          bar: "bg-emerald-500" },
  support:          { label: "Support",           short: "Support",  score:  2, badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", bar: "bg-emerald-400" },
  lean_support:     { label: "Lean Support",      short: "Lean ✓",  score:  1, badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",   bar: "bg-teal-400" },
  neutral:          { label: "Neutral",            short: "Neutral", score:  0, badge: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",  bar: "bg-stone-400" },
  lean_oppose:      { label: "Lean Oppose",        short: "Lean ✗",  score: -1, badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300", bar: "bg-orange-400" },
  oppose:           { label: "Oppose",             short: "Oppose",  score: -2, badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",       bar: "bg-red-400" },
  strongly_oppose:  { label: "Strongly Oppose",    short: "Strong ✗",score: -3, badge: "bg-red-700 text-white",                                               bar: "bg-red-600" },
  // legacy aliases
  undecided:        { label: "Undecided",          short: "?",       score:  0, badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", bar: "bg-amber-400" },
};

const ISSUE_LIBRARY: { category: string; emoji: string; issues: { topic: string; description: string; supportStance: string; opposeStance: string }[] }[] = [
  { category: "Economy", emoji: "📈", issues: [
    { topic: "Minimum Wage Increase",      description: "Raising the federal minimum wage",                       supportStance: "Raise the federal minimum wage",                    opposeStance: "Keep or lower the minimum wage" },
    { topic: "Corporate Tax Rate",         description: "Raising or cutting taxes on corporate profits",          supportStance: "Raise corporate tax rates",                          opposeStance: "Cut or keep corporate taxes low" },
    { topic: "Free Trade & Tariffs",       description: "Trade agreements vs. protectionist tariffs",            supportStance: "Free trade agreements with fewer tariffs",           opposeStance: "Protectionist tariffs to shield domestic industry" },
    { topic: "Universal Basic Income",     description: "Monthly government stipend for all citizens",           supportStance: "Give every citizen a monthly government stipend",    opposeStance: "Reject a universal basic income program" },
    { topic: "Deficit Reduction",          description: "Cutting spending to reduce the national debt",          supportStance: "Cut spending to reduce the national debt",           opposeStance: "Allow deficit spending for investment and programs" },
    { topic: "Labor Union Rights",         description: "Collective bargaining and union organizing",            supportStance: "Expand collective bargaining and union power",        opposeStance: "Limit union organizing rights" },
    { topic: "Gig Economy Regulation",     description: "Worker protections for contractors and gig workers",   supportStance: "Require worker protections and benefits for gig workers", opposeStance: "Keep gig workers classified as independent contractors" },
    { topic: "Wealth Tax",                 description: "Annual tax on accumulated wealth above a threshold",    supportStance: "Tax accumulated wealth above a set threshold annually", opposeStance: "No annual tax on accumulated wealth" },
    { topic: "Student Loan Forgiveness",   description: "Cancellation of federal student loan debt",            supportStance: "Cancel federal student loan debt",                  opposeStance: "Oppose cancellation of student loans" },
    { topic: "Cryptocurrency Regulation",  description: "Regulatory framework for digital assets",              supportStance: "Regulate crypto with federal oversight",             opposeStance: "Keep crypto largely unregulated" },
  ]},
  { category: "Healthcare", emoji: "🏥", issues: [
    { topic: "Medicare for All",           description: "Single-payer government-funded universal healthcare",   supportStance: "Single-payer government healthcare for everyone",     opposeStance: "Keep private insurance as the primary system" },
    { topic: "Affordable Care Act",        description: "Preserving, expanding, or repealing the ACA",          supportStance: "Preserve or expand the ACA",                        opposeStance: "Repeal or reduce the ACA" },
    { topic: "Drug Price Negotiation",     description: "Allowing Medicare to negotiate prescription prices",    supportStance: "Let Medicare negotiate drug prices directly",        opposeStance: "Leave drug pricing to market competition" },
    { topic: "Medicaid Expansion",         description: "Expanding Medicaid to more low-income adults",         supportStance: "Expand Medicaid to more low-income adults",         opposeStance: "Limit or roll back Medicaid expansion" },
    { topic: "Abortion Access",            description: "Legal access to abortion and reproductive healthcare",  supportStance: "Protect legal access to abortion",                  opposeStance: "Restrict or ban abortion access" },
    { topic: "Mental Health Parity",       description: "Equal insurance coverage for mental health care",      supportStance: "Require equal insurance coverage for mental health", opposeStance: "Leave mental health coverage to market decisions" },
    { topic: "Vaccine Policy",             description: "Mandates, exemptions, and public health authority",    supportStance: "Support public health vaccine mandates",            opposeStance: "Oppose vaccine mandates, protect exemptions" },
    { topic: "Opioid & Addiction Care",    description: "Treatment funding and harm reduction programs",        supportStance: "Fund treatment and harm reduction programs",         opposeStance: "Prioritize enforcement over treatment programs" },
    { topic: "End-of-Life Care Rights",    description: "Medical aid in dying and patient autonomy",           supportStance: "Allow medical aid in dying as a patient right",      opposeStance: "Oppose physician-assisted death" },
  ]},
  { category: "Environment", emoji: "🌍", issues: [
    { topic: "Climate Change Policy",      description: "Government action to reduce carbon emissions",         supportStance: "Strong government action to cut carbon emissions",   opposeStance: "Limit government climate intervention" },
    { topic: "Green New Deal",             description: "Federal jobs and clean energy investment program",     supportStance: "Federal investment in clean energy jobs and infrastructure", opposeStance: "Reject the Green New Deal program" },
    { topic: "Fossil Fuel Subsidies",      description: "Ending government subsidies for oil and gas",         supportStance: "End government subsidies for oil and gas",          opposeStance: "Keep fossil fuel subsidies in place" },
    { topic: "Nuclear Energy",             description: "Expanding nuclear power as clean energy source",      supportStance: "Expand nuclear power as clean energy",              opposeStance: "Phase out or restrict nuclear energy" },
    { topic: "Carbon Tax",                 description: "Taxing emissions to incentivize clean energy",        supportStance: "Tax carbon emissions to incentivize clean energy",  opposeStance: "No carbon tax on emissions" },
    { topic: "Electric Vehicle Incentives",description: "Tax credits and charging infrastructure for EVs",     supportStance: "Tax credits and public infrastructure for EVs",     opposeStance: "End government EV subsidies" },
    { topic: "Offshore Drilling",          description: "Allowing oil drilling in coastal federal waters",     supportStance: "Allow oil drilling in coastal federal waters",       opposeStance: "Ban new offshore oil drilling" },
    { topic: "National Park Protection",   description: "Preserving and expanding federal public lands",       supportStance: "Preserve and expand federal public lands",          opposeStance: "Open federal lands to development and resource extraction" },
    { topic: "Plastic Pollution Rules",    description: "Bans or taxes on single-use plastics",               supportStance: "Ban or tax single-use plastics",                    opposeStance: "Leave plastic regulation to industry" },
  ]},
  { category: "Immigration", emoji: "🌐", issues: [
    { topic: "Border Wall / Security",     description: "Physical barriers and enforcement at the border",     supportStance: "Build physical barriers and increase border enforcement", opposeStance: "Oppose a border wall, prefer alternative measures" },
    { topic: "DACA / Dreamers",            description: "Legal status for those brought undocumented as children", supportStance: "Protect Dreamers with permanent legal status",    opposeStance: "End DACA protections" },
    { topic: "Legal Immigration Levels",   description: "Increasing or reducing annual immigration quotas",   supportStance: "Increase annual legal immigration",                 opposeStance: "Reduce legal immigration levels" },
    { topic: "Asylum Policy",              description: "Processing and standards for granting asylum",       supportStance: "Expand asylum access and processing capacity",       opposeStance: "Tighten asylum standards and eligibility" },
    { topic: "Path to Citizenship",        description: "Route to citizenship for undocumented long-term residents", supportStance: "Create a path to citizenship for long-term undocumented residents", opposeStance: "No amnesty or path to citizenship" },
    { topic: "Guest Worker Programs",      description: "Temporary visas for foreign workers in various sectors", supportStance: "Expand temporary visas for foreign workers",     opposeStance: "Limit or reduce guest worker programs" },
    { topic: "ICE & Deportation",          description: "Enforcement priorities and deportation policies",    supportStance: "Limit ICE enforcement to serious crimes",            opposeStance: "Expand deportation enforcement broadly" },
    { topic: "Sanctuary Cities",           description: "Local limits on cooperation with federal immigration", supportStance: "Allow cities to limit immigration enforcement cooperation", opposeStance: "Ban sanctuary city policies" },
    { topic: "Refugee Admissions",         description: "Annual caps and vetting for refugee resettlement",   supportStance: "Increase refugee admissions",                        opposeStance: "Reduce or cap refugee admissions" },
  ]},
  { category: "Gun Policy", emoji: "🔫", issues: [
    { topic: "Universal Background Checks",description: "Requiring background checks for all gun sales",      supportStance: "Require background checks for all gun sales",        opposeStance: "Oppose expanded background check requirements" },
    { topic: "Red Flag Laws",              description: "Temporarily removing guns from people deemed dangerous", supportStance: "Allow courts to temporarily remove guns from dangerous people", opposeStance: "Oppose red flag gun seizure laws" },
    { topic: "Assault Weapons Ban",        description: "Banning semi-automatic rifles and high-cap magazines", supportStance: "Ban semi-automatic rifles and high-capacity magazines", opposeStance: "Oppose an assault weapons ban" },
    { topic: "Concealed Carry Reciprocity",description: "Honoring concealed carry permits across all states", supportStance: "Honor concealed carry permits in all states",         opposeStance: "Let each state set its own carry laws" },
    { topic: "National Gun Registry",      description: "Federal database of firearm ownership",              supportStance: "Create a federal database of gun ownership",        opposeStance: "Oppose a national firearm registry" },
    { topic: "Waiting Periods",            description: "Mandatory delay between purchase and pickup",        supportStance: "Require a waiting period before gun pickup",         opposeStance: "Oppose mandatory waiting periods" },
    { topic: "Bump Stock & Modifier Bans", description: "Restrictions on legal gun modifications",           supportStance: "Ban bump stocks and certain gun modifications",      opposeStance: "Allow legal gun modifications" },
    { topic: "Minimum Purchase Age (21)",  description: "Raising minimum age to purchase long guns to 21",   supportStance: "Raise the long gun purchase age to 21",             opposeStance: "Keep the current purchase age at 18" },
  ]},
  { category: "Education", emoji: "🎓", issues: [
    { topic: "School Choice & Vouchers",   description: "Public funding flowing to private/charter schools",  supportStance: "Allow public funds to flow to private and charter schools", opposeStance: "Keep public funds exclusively in public schools" },
    { topic: "Free Community College",     description: "Tuition-free two-year college for all",             supportStance: "Make two-year college tuition-free for all",        opposeStance: "Keep community college tuition-based" },
    { topic: "Federal Education Standards",description: "National curriculum standards like Common Core",    supportStance: "Set national curriculum standards",                 opposeStance: "Leave curriculum decisions to states and localities" },
    { topic: "Teacher Pay",                description: "Increasing base pay and benefits for teachers",     supportStance: "Increase teacher base pay and benefits",             opposeStance: "Keep teacher compensation to local and market decisions" },
    { topic: "School Prayer",              description: "Allowing religious expression in public schools",   supportStance: "Allow religious expression in public schools",       opposeStance: "Keep prayer out of public schools" },
    { topic: "Sex Education Standards",    description: "Comprehensive vs. abstinence-only sex ed",         supportStance: "Require comprehensive sex education",               opposeStance: "Support abstinence-only or local-choice sex ed" },
    { topic: "Critical Race Theory Bans",  description: "Restricting teaching of race-based history frameworks", supportStance: "Restrict CRT-based curriculum in schools",      opposeStance: "Allow schools to teach race-based history frameworks" },
    { topic: "Special Education Funding",  description: "Federal support for students with disabilities",   supportStance: "Increase federal special education funding",         opposeStance: "Reduce federal special ed mandates" },
    { topic: "Student Debt Cap / Reform",  description: "Limiting how much students can borrow federally",  supportStance: "Cap or reform how much students can borrow federally", opposeStance: "Keep the current federal borrowing system" },
  ]},
  { category: "Criminal Justice", emoji: "⚖️", issues: [
    { topic: "Police Reform",              description: "Accountability, training, and oversight of law enforcement", supportStance: "Increase police accountability and civilian oversight", opposeStance: "Oppose new restrictions on law enforcement" },
    { topic: "Mandatory Minimum Sentences",description: "Required minimum prison terms for specific crimes",     supportStance: "Keep mandatory minimum sentencing laws",             opposeStance: "Repeal mandatory minimum sentencing laws" },
    { topic: "Death Penalty",              description: "Capital punishment for the most serious crimes",         supportStance: "Maintain capital punishment for the most serious crimes", opposeStance: "Abolish the death penalty" },
    { topic: "Drug Decriminalization",     description: "Reducing criminal penalties for personal drug use",     supportStance: "Reduce criminal penalties for personal drug use",     opposeStance: "Maintain criminal penalties for drug use" },
    { topic: "Cannabis Legalization",      description: "Federal legalization and regulation of marijuana",      supportStance: "Federally legalize and regulate marijuana",           opposeStance: "Keep marijuana federally illegal" },
    { topic: "Prison Reform",              description: "Rehabilitation-focused incarceration approach",         supportStance: "Shift to rehabilitation-focused incarceration",       opposeStance: "Maintain a punitive incarceration approach" },
    { topic: "Qualified Immunity",         description: "Legal protections shielding officers from civil suits", supportStance: "Keep qualified immunity protections for officers",    opposeStance: "End or limit qualified immunity" },
    { topic: "Cash Bail Reform",           description: "Eliminating or reforming pre-trial cash bail system",  supportStance: "Eliminate or reform pre-trial cash bail",            opposeStance: "Keep the cash bail system in place" },
    { topic: "Private Prisons",            description: "For-profit prison contracts with the government",      supportStance: "Allow for-profit prison contracts with government",   opposeStance: "Ban private for-profit prisons" },
  ]},
  { category: "Social Issues", emoji: "🤝", issues: [
    { topic: "LGBTQ+ Anti-Discrimination",description: "Federal protections against discrimination",            supportStance: "Federal anti-discrimination protections for LGBTQ+ people", opposeStance: "Leave protections to states and private entities" },
    { topic: "Transgender in Sports",      description: "Policies on trans athletes in competitive sports",     supportStance: "Allow trans athletes to compete per gender identity", opposeStance: "Restrict trans athletes to biological sex category" },
    { topic: "Same-Sex Marriage",          description: "Federal legal protection of same-sex marriage",        supportStance: "Federal legal protection of same-sex marriage",       opposeStance: "Leave marriage definition to states" },
    { topic: "Affirmative Action",         description: "Race-conscious college admissions and hiring",         supportStance: "Allow race-conscious admissions and hiring decisions", opposeStance: "Ban race-conscious affirmative action" },
    { topic: "Reparations",               description: "Compensation for descendants of enslaved people",      supportStance: "Compensate descendants of enslaved people",           opposeStance: "Oppose reparations payments" },
    { topic: "Religious Freedom Laws",     description: "Protections for businesses citing religious beliefs",  supportStance: "Protect businesses from requirements that conflict with their religion", opposeStance: "Oppose religion-based exemptions from anti-discrimination law" },
    { topic: "Voting Rights Expansion",    description: "Expanding access to voting and reducing restrictions", supportStance: "Expand voting access and reduce restrictions",         opposeStance: "Support voter ID and tighter election security measures" },
    { topic: "Electoral College Reform",   description: "Reforming or abolishing the Electoral College",       supportStance: "Reform or abolish the Electoral College",             opposeStance: "Keep the Electoral College as is" },
    { topic: "Citizens United / Campaign Finance", description: "Limiting corporate money in political campaigns", supportStance: "Limit corporate and dark money in elections",   opposeStance: "Protect unlimited political spending as free speech" },
  ]},
  { category: "Foreign Policy", emoji: "🌏", issues: [
    { topic: "NATO & Military Alliances",  description: "U.S. commitments to international defense pacts",     supportStance: "Maintain strong U.S. commitments to NATO and allies", opposeStance: "Reduce U.S. financial obligations to alliances" },
    { topic: "Foreign Aid",               description: "U.S. financial and military assistance abroad",        supportStance: "Maintain or increase U.S. foreign assistance programs", opposeStance: "Cut or eliminate foreign aid programs" },
    { topic: "China Relations",           description: "Trade, military, and diplomatic policy toward China",  supportStance: "Firm stance on trade, military, and diplomacy with China", opposeStance: "More cooperative and diplomatic approach with China" },
    { topic: "Israel-Palestine Policy",   description: "U.S. stance on the conflict and military aid",        supportStance: "Strong military and diplomatic support for Israel",   opposeStance: "Condition or reduce U.S. military support for Israel" },
    { topic: "Ukraine Military Aid",      description: "Weapons and financial support for Ukraine",           supportStance: "Continue weapons and financial support for Ukraine",   opposeStance: "End or reduce U.S. aid to Ukraine" },
    { topic: "Nuclear Non-Proliferation", description: "Arms control treaties and nuclear disarmament",       supportStance: "Pursue arms control and disarmament treaties",         opposeStance: "Maintain full nuclear deterrence, limit treaty obligations" },
    { topic: "Cuba & Iran Sanctions",     description: "Economic pressure on adversarial governments",       supportStance: "Keep or strengthen economic sanctions",               opposeStance: "Ease sanctions and pursue diplomatic engagement" },
    { topic: "Defense Budget",            description: "Overall level of military spending",                  supportStance: "Increase the defense budget",                         opposeStance: "Cut or cap military spending" },
    { topic: "Drone Warfare",             description: "Use of armed drones in counterterrorism operations",  supportStance: "Use armed drones in counterterrorism operations",     opposeStance: "Restrict or end drone warfare programs" },
  ]},
  { category: "Taxation", emoji: "💰", issues: [
    { topic: "Top Income Tax Rate",        description: "Marginal rate for the highest earners",               supportStance: "Raise the top marginal income tax rate",             opposeStance: "Cut or keep top income taxes low" },
    { topic: "Capital Gains Tax",          description: "Tax on profits from investments",                     supportStance: "Raise taxes on investment profits",                  opposeStance: "Keep capital gains taxes low to encourage investment" },
    { topic: "Estate / Inheritance Tax",   description: "Taxes on wealth transferred at death",               supportStance: "Maintain or raise the estate tax on inherited wealth", opposeStance: "Reduce or repeal the estate tax" },
    { topic: "Flat Tax",                   description: "Single tax rate regardless of income level",          supportStance: "Single flat tax rate for all income levels",          opposeStance: "Keep a progressive graduated tax system" },
    { topic: "Offshore Tax Haven Rules",   description: "Closing loopholes for overseas tax avoidance",       supportStance: "Close offshore tax avoidance loopholes",              opposeStance: "Keep current international tax rules" },
    { topic: "Child Tax Credit Expansion", description: "Expanding monthly payments to families with children", supportStance: "Expand monthly child tax credit payments to families", opposeStance: "Keep child tax credit at current levels" },
    { topic: "Tax Code Simplification",    description: "Streamlining and simplifying the tax filing process", supportStance: "Streamline and simplify the tax code and filing",    opposeStance: "Keep the current tax code structure" },
  ]},
  { category: "Housing", emoji: "🏠", issues: [
    { topic: "Rent Control",              description: "Government limits on how much landlords can charge",   supportStance: "Set government limits on rent increases",            opposeStance: "Let market forces determine rental prices" },
    { topic: "Zoning Reform",             description: "Allowing more housing density in cities and suburbs",  supportStance: "Allow more housing density in cities and suburbs",   opposeStance: "Preserve local zoning and neighborhood character" },
    { topic: "Affordable Housing Funding",description: "Federal investment in below-market housing units",    supportStance: "Federal investment in below-market affordable housing", opposeStance: "Leave affordable housing primarily to the market" },
    { topic: "Homelessness Solutions",    description: "Housing-first vs. treatment-first policy approaches", supportStance: "Housing-first approach — provide housing before treatment requirements", opposeStance: "Treatment-first — require treatment before housing benefits" },
    { topic: "First-Time Buyer Assistance",description: "Down payment help and favorable loans",             supportStance: "Government down payment help and favorable loans for first buyers", opposeStance: "Let home buying remain market-driven without subsidies" },
    { topic: "Eviction Protections",      description: "Tenant protections during financial hardship",       supportStance: "Strong tenant protections from eviction during hardship", opposeStance: "Prioritize landlord property rights over eviction limits" },
  ]},
  { category: "Technology", emoji: "💻", issues: [
    { topic: "Social Media Regulation",   description: "Oversight of content moderation and algorithm transparency", supportStance: "Regulate content moderation and require algorithm transparency", opposeStance: "Minimal government oversight of social media platforms" },
    { topic: "Data Privacy Rights",       description: "Laws protecting personal data from corporations",      supportStance: "Strong laws protecting personal data from corporations", opposeStance: "Let companies self-regulate data collection and use" },
    { topic: "Net Neutrality",            description: "Rules requiring equal treatment of internet traffic",  supportStance: "Require ISPs to treat all internet traffic equally",  opposeStance: "Let ISPs prioritize and manage traffic as they choose" },
    { topic: "Section 230 Reform",        description: "Liability rules for online platforms over user content", supportStance: "Reform or reduce platform liability protections (Section 230)", opposeStance: "Keep current Section 230 protections for online platforms" },
    { topic: "AI Regulation",             description: "Government oversight of artificial intelligence systems", supportStance: "Government oversight and safety rules for AI systems", opposeStance: "Let AI develop with minimal government regulation" },
    { topic: "Big Tech Antitrust",        description: "Breaking up or regulating dominant tech companies",   supportStance: "Break up or heavily regulate dominant tech companies", opposeStance: "Allow tech companies to compete and grow freely" },
    { topic: "Digital Dollar (CBDC)",     description: "A government-issued central bank digital currency",   supportStance: "Create a government-issued central bank digital currency", opposeStance: "Oppose a government-controlled digital dollar" },
  ]},
  { category: "Infrastructure", emoji: "🏗️", issues: [
    { topic: "Infrastructure Investment",  description: "Federal spending on roads, bridges, and transit",    supportStance: "Major federal spending on roads, bridges, and transit", opposeStance: "Leave infrastructure primarily to states and private sector" },
    { topic: "High-Speed Rail",           description: "Building a national passenger rail network",         supportStance: "Build a national high-speed passenger rail network",  opposeStance: "Focus transportation investment elsewhere" },
    { topic: "Broadband Access",          description: "Universal high-speed internet as a public utility",  supportStance: "Universal high-speed internet as a public utility",   opposeStance: "Let private companies build broadband without mandates" },
    { topic: "Water System Safety",       description: "Replacing lead pipes and upgrading water infrastructure", supportStance: "Federal funding to replace lead pipes and upgrade water systems", opposeStance: "Leave water infrastructure investment to local governments" },
    { topic: "Public Transit Funding",    description: "Federal support for buses, subways, and light rail", supportStance: "Increase federal support for public transit systems",  opposeStance: "Reduce federal transit subsidies" },
  ]},
  { category: "Veterans", emoji: "🎖️", issues: [
    { topic: "VA Healthcare Funding",     description: "Budget and capacity of veterans health services",    supportStance: "Increase VA healthcare budget and capacity",          opposeStance: "Reform VA with private-sector alternatives instead" },
    { topic: "Veterans Disability Benefits",description:"Compensation and pensions for service-related injuries", supportStance: "Expand compensation for service-related injuries", opposeStance: "Tighten eligibility standards for disability benefits" },
    { topic: "PTSD & Mental Health Care", description: "Treatment programs for combat-related trauma",       supportStance: "Increase funding for veteran PTSD and mental health treatment", opposeStance: "Reform rather than expand current veteran mental health programs" },
    { topic: "GI Bill Expansion",         description: "Education and training benefits for veterans",       supportStance: "Expand education and training benefits under the GI Bill", opposeStance: "Keep GI Bill at current benefit levels" },
    { topic: "Military Housing Allowance",description: "Pay and housing for active-duty service members",   supportStance: "Increase housing pay and benefits for service members", opposeStance: "Keep military pay and housing at current levels" },
  ]},
];

const ISSUE_CATEGORIES = ISSUE_LIBRARY.map(g => g.category);

// Political Ideology axes — stored as issues with category "Political Identity"
// position field maps to step index: strongly_support=0(left) … strongly_oppose=6(right)
const AXIS_POSITIONS = ["strongly_support","support","lean_support","neutral","lean_oppose","oppose","strongly_oppose"] as const;
const IDEOLOGY_AXES: { topic: string; emoji: string; leftLabel: string; rightLabel: string; steps: { label: string; desc: string }[] }[] = [
  { topic: "Economic Axis", emoji: "💵", leftLabel: "Socialist", rightLabel: "Laissez-Faire",
    steps: [
      { label: "Socialist",       desc: "Collective ownership, planned economy, full redistribution" },
      { label: "Social Democrat", desc: "Large public sector, strong welfare, high wealth taxes" },
      { label: "Center-Left",     desc: "Mixed economy, robust safety net, regulated capitalism" },
      { label: "Centrist",        desc: "Moderate, pragmatic mixed economy" },
      { label: "Center-Right",    desc: "Free markets preferred, limited welfare, deregulation" },
      { label: "Capitalist",      desc: "Low taxes, minimal regulation, market-driven solutions" },
      { label: "Laissez-Faire",   desc: "Zero government economic intervention — pure free market" },
    ]},
  { topic: "Social Axis", emoji: "🌈", leftLabel: "Progressive", rightLabel: "Traditionalist",
    steps: [
      { label: "Progressive",         desc: "Bold social change, equity, challenging traditional norms" },
      { label: "Liberal",             desc: "Civil liberties, individual expression, cultural openness" },
      { label: "Center-Left Social",  desc: "Generally open, supportive of diversity and reform" },
      { label: "Moderate",            desc: "Mix of traditional and modern values" },
      { label: "Center-Right Social", desc: "Values tradition while accepting gradual social change" },
      { label: "Conservative",        desc: "Family values, cultural heritage, religious influence" },
      { label: "Traditionalist",      desc: "Strict adherence to traditional norms, opposes cultural change" },
    ]},
  { topic: "Government Authority Axis", emoji: "⚖️", leftLabel: "Anarchist", rightLabel: "Authoritarian",
    steps: [
      { label: "Anarchist",        desc: "No state authority — voluntary cooperation only" },
      { label: "Libertarian",      desc: "Minimal state, maximum individual freedom" },
      { label: "Classical Liberal",desc: "Limited government protecting rights and free markets" },
      { label: "Moderate",         desc: "Balanced government authority with individual rights" },
      { label: "Statist",          desc: "Government as primary vehicle for order and public good" },
      { label: "Authoritarian",    desc: "Strong state authority prioritized over individual freedom" },
      { label: "Totalitarian",     desc: "Total government control over all aspects of life" },
    ]},
  { topic: "Foreign Policy Axis", emoji: "🌍", leftLabel: "Isolationist", rightLabel: "Interventionist",
    steps: [
      { label: "Isolationist",      desc: "No foreign entanglements, focus entirely at home" },
      { label: "Non-Interventionist",desc: "Avoid foreign military action, minimize commitments" },
      { label: "Multilateralist",   desc: "Prefer international institutions and coalition action" },
      { label: "Moderate",          desc: "Selective engagement, case-by-case decisions" },
      { label: "Internationalist",  desc: "Active global leadership through diplomacy and alliances" },
      { label: "Hawkish",           desc: "Strong military presence, willing to use force proactively" },
      { label: "Interventionist",   desc: "Active military and political intervention to shape world order" },
    ]},
  { topic: "National vs. Global Axis", emoji: "🗺️", leftLabel: "Nationalist", rightLabel: "Globalist",
    steps: [
      { label: "Nationalist",      desc: "Nation first, protect sovereignty and national identity" },
      { label: "National-First",   desc: "Strong national pride, skeptical of international commitments" },
      { label: "National-Leaning", desc: "Prioritizes domestic interests with selective global engagement" },
      { label: "Balanced",         desc: "Balances national interest and global cooperation" },
      { label: "Global-Leaning",   desc: "Values international cooperation and shared norms" },
      { label: "Internationalist", desc: "Believes in global institutions and international law" },
      { label: "Globalist",        desc: "World citizenship, open borders, global governance preferred" },
    ]},
  { topic: "Government Size Axis", emoji: "🏛️", leftLabel: "Minimal State", rightLabel: "Expansive State",
    steps: [
      { label: "Minimal State",      desc: "Government does almost nothing beyond basic security" },
      { label: "Small Government",   desc: "Very limited programs, low taxes, maximum local control" },
      { label: "Lean Government",    desc: "Selective programs, fiscal restraint, state-level preference" },
      { label: "Moderate",           desc: "Balanced size and role of government" },
      { label: "Active Government",  desc: "Government as partner in solving social problems" },
      { label: "Large Government",   desc: "Extensive programs, services, and regulation" },
      { label: "Expansive State",    desc: "Government as primary provider across all major life domains" },
    ]},
];

const IDEOLOGY_IDENTIFICATION_META: Record<string, { label: string; short: string; badge: string }> = {
  strongly_support: { label: "Primary Identity",   short: "Primary",  badge: "bg-violet-600 text-white" },
  support:          { label: "I Identify With",     short: "Identify", badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  lean_support:     { label: "Partially",           short: "Partial",  badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  neutral:          { label: "Neutral / Exploring", short: "Exploring",badge: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300" },
  lean_oppose:      { label: "Lean Against",        short: "Lean ✗",   badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  oppose:           { label: "Oppose",              short: "Oppose",   badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  strongly_oppose:  { label: "Strongly Oppose",     short: "Strong ✗", badge: "bg-red-700 text-white" },
};

const IDEOLOGY_LIBRARY: { category: string; emoji: string; ideologies: { name: string; description: string }[] }[] = [
  { category: "Mainstream American", emoji: "🇺🇸", ideologies: [
    { name: "Liberal",            description: "Center-left: civil rights, social programs, regulated markets, climate action" },
    { name: "Progressive",        description: "Left of liberal: economic justice, racial equity, bold climate policy, anti-corporate power" },
    { name: "Conservative",       description: "Center-right: limited government, free markets, traditional values, strong national defense" },
    { name: "Moderate / Centrist",description: "Pragmatic blend of both; rejects ideological extremes, issue-by-issue decisions" },
    { name: "Libertarian",        description: "Minimal government in economic and personal life — free markets and civil liberties" },
    { name: "Left-Populist",      description: "Anti-establishment left: working class vs. corporate elite, economic democracy" },
    { name: "Right-Populist",     description: "Anti-establishment right: nationalism, anti-globalism, skeptical of institutions" },
  ]},
  { category: "Economic Schools", emoji: "📊", ideologies: [
    { name: "Keynesian",               description: "Government spending and fiscal stimulus to manage economic cycles" },
    { name: "Supply-Side (Trickle-Down)",description: "Tax cuts for businesses and wealthy drive broader economic growth" },
    { name: "Social Democrat",         description: "Capitalism with strong welfare state, labor rights, heavy redistribution" },
    { name: "Democratic Socialist",    description: "Political democracy combined with socialist economic ownership" },
    { name: "Market Socialist",        description: "Worker-owned enterprises competing in free markets" },
    { name: "Classical Liberal (Economic)",description: "Free markets, private property, limited government — 19th century tradition" },
    { name: "Neoliberal",              description: "Free trade, deregulation, privatization, globalization, fiscal discipline" },
    { name: "Laissez-Faire Capitalist",description: "Zero government economic interference — pure free market" },
    { name: "Distributist",            description: "Widespread ownership of productive property; neither corporate capitalism nor socialism" },
    { name: "Georgist",                description: "Land value tax as primary revenue; otherwise free markets" },
    { name: "MMT Advocate",            description: "Government currency creation means deficits less constrained than mainstream economics holds" },
  ]},
  { category: "Conservative Variants", emoji: "🦅", ideologies: [
    { name: "Fiscal Conservative",        description: "Low taxes, balanced budgets, spending cuts as top priority" },
    { name: "Social Conservative",        description: "Traditional family, religious values, opposition to rapid social change" },
    { name: "Neoconservative",            description: "Strong military, democracy promotion abroad, assertive foreign policy" },
    { name: "Paleoconservative",          description: "America First, non-interventionism, cultural heritage, immigration restriction" },
    { name: "National Conservative",      description: "Sovereign nation, cultural conservatism, skeptical of globalism" },
    { name: "Christian Conservative",     description: "Policy grounded in Christian values and scripture" },
    { name: "Fusionist",                  description: "Free-market economics fused with social conservatism (Reagan coalition)" },
    { name: "Reform Conservative",        description: "Updated conservatism focused on middle-class concerns and practical governance" },
    { name: "Compassionate Conservative", description: "Conservative values combined with active social programs" },
    { name: "Traditionalist Conservative",description: "Preserving inherited culture, institutions, and organic social order" },
    { name: "Post-Liberal Conservative",  description: "Critiques liberalism's individualism; emphasizes community and common good" },
  ]},
  { category: "Liberal / Progressive Variants", emoji: "🕊️", ideologies: [
    { name: "Third Way / New Democrat",   description: "Center-left market economics with social inclusion (Clinton-era approach)" },
    { name: "Social Liberal",             description: "Civil liberties, personal freedom, and tolerance as core political values" },
    { name: "Green Liberal",              description: "Liberal politics with environmentalism as a top-tier priority" },
    { name: "Feminist",                   description: "Gender equality as a central organizing political principle" },
    { name: "Egalitarian",                description: "Reducing all forms of social and economic inequality" },
    { name: "Communitarian",              description: "Balancing individual rights with community responsibilities" },
    { name: "Anti-Imperialist Left",      description: "Opposition to U.S. military and economic dominance abroad" },
    { name: "Democratic Socialism (Left-Liberal)", description: "Reform through democratic institutions, strong welfare, progressive taxation" },
  ]},
  { category: "Libertarian Variants", emoji: "🗽", ideologies: [
    { name: "Classical Libertarian",  description: "Non-aggression principle, minimal state, free markets, personal freedom" },
    { name: "Minarchist",             description: "Government limited to courts, police, and national defense only" },
    { name: "Anarcho-Capitalist",     description: "No state at all — private voluntary markets replace all government functions" },
    { name: "Civil Libertarian",      description: "Focus on constitutional rights, free speech, due process, privacy" },
    { name: "Left-Libertarian",       description: "Freedom from both state and capitalist authority — decentralized, egalitarian" },
    { name: "Voluntaryist",           description: "All human relations should be voluntary — reject coercive institutions" },
    { name: "Agorist",                description: "Libertarianism through counter-economics and peaceful market resistance to state" },
  ]},
  { category: "Governance & Structure", emoji: "⚙️", ideologies: [
    { name: "Federalist",             description: "Strong national government with clear federal authority over states" },
    { name: "States' Rights Advocate",description: "Power devolved to states, strictly limited federal government" },
    { name: "Constitutionalist",      description: "Strict adherence to the Constitution as written or originally intended" },
    { name: "Technocrat",             description: "Governance by experts and evidence-based policy over partisan politics" },
    { name: "Civic Republican",       description: "Active citizenship, public duty, participation as foundation of governance" },
    { name: "Deliberative Democrat",  description: "Democracy centered on reasoned public debate and consensus" },
    { name: "Direct Democrat",        description: "Governance through direct citizen votes rather than representatives" },
  ]},
  { category: "Environmental", emoji: "🌿", ideologies: [
    { name: "Environmentalist",         description: "Environmental protection as a central political priority" },
    { name: "Eco-Socialist",            description: "Capitalism structurally incompatible with ecological survival" },
    { name: "Green Politics",           description: "Ecology, social justice, grassroots democracy, and nonviolence" },
    { name: "Degrowth Advocate",        description: "Reducing economic output to achieve ecological sustainability" },
    { name: "Environmental Conservative",description: "Conservative stewardship of natural resources and public lands" },
    { name: "Solarpunk",                description: "Radical ecological optimism — green technology and social equity" },
  ]},
  { category: "Identity & Culture", emoji: "🤝", ideologies: [
    { name: "Multiculturalist",           description: "Celebrating and preserving diverse cultural identities within society" },
    { name: "Nationalist",                description: "Prioritizing national identity, culture, and sovereignty" },
    { name: "Cultural Pluralist",         description: "Multiple distinct cultures coexisting and mutually enriching society" },
    { name: "Cosmopolitan",               description: "World citizenship — all humans share one moral community" },
    { name: "Indigenous Rights Advocate", description: "Centering indigenous sovereignty, land rights, and self-determination" },
    { name: "Pan-Africanist",             description: "Unity and solidarity among African peoples and the diaspora" },
    { name: "Secular Humanist",           description: "Human-centered ethics and governance without religious authority" },
    { name: "Religious Pluralist",        description: "All religions deserve equal respect and accommodation in public life" },
  ]},
  { category: "Far-Left", emoji: "✊", ideologies: [
    { name: "Socialist",          description: "Social ownership of means of production, class-conscious politics" },
    { name: "Communist",          description: "Classless, stateless society via revolution; collective ownership of production" },
    { name: "Marxist-Leninist",   description: "Vanguard party leads revolutionary socialism toward communism" },
    { name: "Trotskyist",         description: "Permanent revolution, internationalism, opposition to Stalinism" },
    { name: "Anarchist",          description: "No hierarchical authority; voluntary cooperation and mutual aid" },
    { name: "Anarcho-Communist",  description: "Communal ownership without state — stateless communism" },
    { name: "Syndicalist",        description: "Worker control of industry through trade unions" },
    { name: "Maoist",             description: "Rural revolutionary socialism; mass line politics; continuous revolution" },
    { name: "Council Communist",  description: "Worker councils as the revolutionary vehicle, not vanguard parties" },
  ]},
  { category: "Far-Right", emoji: "⚠️", ideologies: [
    { name: "Fascist",                 description: "Authoritarian ultranationalism, militarism, suppression of opposition" },
    { name: "Neo-Fascist",             description: "Contemporary adaptations of fascist ideology" },
    { name: "Theocrat",                description: "Government based on religious law or clerical authority" },
    { name: "Authoritarian Nationalist",description: "Strong-state nationalism with anti-democratic tendencies" },
    { name: "Reactionary",             description: "Reversal of progressive changes; restoring a prior social order" },
    { name: "Ethno-Nationalist",       description: "Nation defined by shared ethnic or racial identity" },
  ]},
  { category: "Philosophical / Meta", emoji: "🔭", ideologies: [
    { name: "Pragmatist",                description: "What works matters more than ideological purity — empirical problem-solving" },
    { name: "Utilitarian",               description: "Greatest good for greatest number as the political north star" },
    { name: "Deontological Liberal",     description: "Rights-based politics — duties and rights, not just outcomes" },
    { name: "Post-Liberal",              description: "Critiques classical liberalism's individualism and market assumptions" },
    { name: "Social Contract Theorist",  description: "Government legitimacy derives from consent of the governed" },
    { name: "Paternalist",               description: "Government may restrict freedom to protect people's own wellbeing" },
    { name: "Anti-Politics / Apolitical",description: "Skeptical of political systems and ideological labels altogether" },
  ]},
];

const ELECTION_LEVELS = ["Federal", "State", "Local", "Primary", "Special"];
const ACTION_TYPES = [
  { value: "voted",       label: "Voted",                   emoji: "🗳️" },
  { value: "called",      label: "Called representative",   emoji: "📞" },
  { value: "emailed",     label: "Emailed representative",  emoji: "✉️" },
  { value: "attended",    label: "Attended event/rally",    emoji: "📢" },
  { value: "volunteered", label: "Volunteered",             emoji: "🤝" },
  { value: "donated",     label: "Donated",                 emoji: "💰" },
  { value: "petition",    label: "Signed petition",         emoji: "📜" },
  { value: "letter",      label: "Wrote letter",            emoji: "📝" },
  { value: "canvassed",   label: "Canvassed",               emoji: "🚶" },
  { value: "other",       label: "Other",                   emoji: "⚡" },
];
const BIAS_OPTIONS = ["left", "center-left", "center", "center-right", "right"];
const BIAS_META: Record<string, { label: string; color: string }> = {
  "left":         { label: "Left",         color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  "center-left":  { label: "Center-Left",  color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  "center":       { label: "Center",       color: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300" },
  "center-right": { label: "Center-Right", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  "right":        { label: "Right",        color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};
const SOURCE_TYPES = ["Newspaper", "TV", "Podcast", "Newsletter", "Website", "Radio", "Other"];
const PARTY_COLORS: Record<string, string> = {
  Democrat:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Republican:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  Independent: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  Green:       "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  Libertarian: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

// ── Shared helpers ─────────────────────────────────────────────────────────────

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 ${props.className ?? ""}`} />;
}
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} rows={3} className={`w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none ${props.className ?? ""}`} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 ${props.className ?? ""}`} />
  );
}
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5">
          <Star size={16} className={n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"} />
        </button>
      ))}
    </div>
  );
}
function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{children}</span>;
}

// ── US States ─────────────────────────────────────────────────────────────────

const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" }, { code: "DC", name: "D.C." },
  { code: "AS", name: "American Samoa" }, { code: "GU", name: "Guam" }, { code: "PR", name: "Puerto Rico" },
  { code: "VI", name: "U.S. Virgin Islands" },
];

// ── Congress.gov search component ─────────────────────────────────────────────

type CongressMember = {
  bioguideId: string;
  name: string;
  title: string;
  chamber: "Senate" | "House";
  party: string;
  state: string;
  district: string | null;
  phone?: string | null;
  office?: string | null;
  website: string | null;
  imageUrl: string | null;
};

type SearchMode = "state" | "zip" | "name";

function CongressSearch({
  existingOfficials,
  onAdd,
}: {
  existingOfficials: PoliticalOfficial[];
  onAdd: (member: CongressMember) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SearchMode>("zip");

  // Search inputs
  const [stateCode, setStateCode] = useState("");
  const [zipInput, setZipInput] = useState("");
  const [nameInput, setNameInput] = useState("");

  const [searchedLabel, setSearchedLabel] = useState("");
  const [members, setMembers] = useState<CongressMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Result filters (state mode only)
  const [nameFilter, setNameFilter] = useState("");
  const [chamberFilter, setChamberFilter] = useState<"All" | "Senate" | "House">("All");
  const [partyFilter, setPartyFilter] = useState("All");
  const [districtFilter, setDistrictFilter] = useState("");

  const existingNames = new Set(existingOfficials.map(o => o.name.toLowerCase().trim()));

  function resetFilters() {
    setNameFilter(""); setChamberFilter("All"); setPartyFilter("All"); setDistrictFilter("");
  }
  function clearResults() {
    setMembers([]); setError(""); resetFilters(); setAddedIds(new Set());
  }

  async function search() {
    setLoading(true);
    setError("");
    setMembers([]);
    resetFilters();
    try {
      let url = "";
      let label = "";
      if (mode === "state") {
        if (!stateCode) { setError("Please select a state."); setLoading(false); return; }
        url = `/api/politics/congress/members?state=${stateCode}`;
        label = US_STATES.find(s => s.code === stateCode)?.name ?? stateCode;
      } else if (mode === "zip") {
        if (!/^\d{5}$/.test(zipInput.trim())) { setError("Please enter a valid 5-digit ZIP code."); setLoading(false); return; }
        url = `/api/politics/whoismyrep?zip=${zipInput.trim()}`;
        label = `ZIP ${zipInput.trim()}`;
      } else {
        if (!nameInput.trim()) { setError("Please enter a last name."); setLoading(false); return; }
        url = `/api/politics/whoismyrep?name=${encodeURIComponent(nameInput.trim())}`;
        label = `"${nameInput.trim()}"`;
      }
      const r = await apiRequest("GET", url);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to load members");
      setMembers(data);
      setSearchedLabel(label);
      setAddedIds(new Set());
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(member: CongressMember) {
    setAddingIds(prev => new Set(prev).add(member.bioguideId));
    try {
      await onAdd(member);
      setAddedIds(prev => new Set(prev).add(member.bioguideId));
    } finally {
      setAddingIds(prev => { const s = new Set(prev); s.delete(member.bioguideId); return s; });
    }
  }

  // Apply all filters to get visible members
  const filtered = members.filter(m => {
    if (chamberFilter !== "All" && m.chamber !== chamberFilter) return false;
    if (partyFilter !== "All" && m.party !== partyFilter) return false;
    if (districtFilter && m.district !== districtFilter) return false;
    if (nameFilter && !m.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
    return true;
  });

  async function addAllVisible() {
    const toAdd = filtered.filter(m => !addedIds.has(m.bioguideId) && !existingNames.has(m.name.toLowerCase().trim()));
    for (const m of toAdd) await handleAdd(m);
  }

  // Available parties in current result set
  const availableParties = ["All", ...Array.from(new Set(members.map(m => m.party).filter(Boolean))).sort()];
  // Available districts in current result set
  const availableDistricts = Array.from(new Set(members.filter(m => m.district).map(m => m.district!))).sort((a, b) => Number(a) - Number(b));

  const filteredSenators = filtered.filter(m => m.chamber === "Senate");
  const filteredHouse = filtered.filter(m => m.chamber === "House");
  const allVisibleAdded = filtered.length > 0 && filtered.every(m => addedIds.has(m.bioguideId) || existingNames.has(m.name.toLowerCase().trim()));
  const filtersActive = chamberFilter !== "All" || partyFilter !== "All" || districtFilter !== "" || nameFilter !== "";

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <Search size={14} />Find Representatives
      </Button>
    );
  }

  return (
    <div className="border rounded-xl bg-secondary/20 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Landmark size={15} className="text-primary" />
          Find Federal Representatives
        </h3>
        <button onClick={() => { setOpen(false); clearResults(); }} className="p-1 rounded hover:bg-secondary transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-secondary rounded-lg p-0.5">
        {([
          { id: "zip",   label: "By ZIP Code" },
          { id: "state", label: "By State"    },
          { id: "name",  label: "By Name"     },
        ] as { id: SearchMode; label: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => { setMode(tab.id); clearResults(); }}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              mode === tab.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search input row */}
      <div className="flex gap-2">
        {mode === "zip" && (
          <input
            value={zipInput}
            onChange={e => setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5))}
            onKeyDown={e => e.key === "Enter" && search()}
            placeholder="Enter ZIP code (e.g. 10001)"
            maxLength={5}
            className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        )}
        {mode === "state" && (
          <Select value={stateCode} onChange={e => setStateCode(e.target.value)} className="flex-1">
            <option value="">Select a state…</option>
            {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
          </Select>
        )}
        {mode === "name" && (
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()}
            placeholder="Enter last name (e.g. Smith)"
            className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        )}
        <Button size="sm" onClick={search} disabled={loading} className="gap-1.5 shrink-0">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {loading ? "Searching…" : "Search"}
        </Button>
      </div>

      {mode === "zip" && <p className="text-xs text-muted-foreground -mt-2">Finds your 2 senators + your exact House representative for that ZIP code</p>}
      {mode === "name" && <p className="text-xs text-muted-foreground -mt-2">Search by last name across all current members of Congress</p>}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Filters — shown once results are loaded */}
      {members.length > 0 && (
        <>
          <div className="space-y-2 pt-1 border-t">
            <p className="text-xs font-medium text-muted-foreground">Filter results</p>
            <div className="grid grid-cols-2 gap-2">
              {/* Name search */}
              <div className="col-span-2 relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
                <input
                  value={nameFilter}
                  onChange={e => setNameFilter(e.target.value)}
                  placeholder="Search by name…"
                  className="w-full border rounded-lg pl-7 pr-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {nameFilter && (
                  <button onClick={() => setNameFilter("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Chamber */}
              <Select value={chamberFilter} onChange={e => setChamberFilter(e.target.value as any)}>
                <option value="All">All chambers</option>
                <option value="Senate">Senate only</option>
                <option value="House">House only</option>
              </Select>

              {/* Party */}
              <Select value={partyFilter} onChange={e => setPartyFilter(e.target.value)}>
                {availableParties.map(p => <option key={p} value={p}>{p === "All" ? "All parties" : p}</option>)}
              </Select>

              {/* District — only useful when House is visible */}
              {chamberFilter !== "Senate" && availableDistricts.length > 0 && (
                <Select value={districtFilter} onChange={e => setDistrictFilter(e.target.value)}>
                  <option value="">All districts</option>
                  {availableDistricts.map(d => <option key={d} value={d}>District {d}</option>)}
                </Select>
              )}

              {/* Reset filters */}
              {filtersActive && (
                <button
                  onClick={() => { setNameFilter(""); setChamberFilter("All"); setPartyFilter("All"); setDistrictFilter(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline text-left self-center"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Results header */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {filtersActive
                ? <><strong>{filtered.length}</strong> of {members.length} members match</>
                : <><strong>{members.length}</strong> current federal members for <strong>{searchedLabel}</strong></>
              }
            </p>
            {!allVisibleAdded && filtered.length > 0 && (
              <Button size="sm" variant="outline" onClick={addAllVisible} className="gap-1.5 text-xs h-7">
                <PlusCircle size={12} />
                {filtersActive ? `Add ${filtered.length} shown` : `Add All ${searchedLabel} Reps`}
              </Button>
            )}
          </div>

          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No members match your filters.</p>
          )}

          {/* Senators */}
          {filteredSenators.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">U.S. Senators</p>
              <div className="space-y-1.5">
                {filteredSenators.map(m => <MemberRow key={m.bioguideId} member={m} existingNames={existingNames} addedIds={addedIds} addingIds={addingIds} onAdd={handleAdd} />)}
              </div>
            </div>
          )}

          {/* House */}
          {filteredHouse.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                U.S. House of Representatives ({filteredHouse.length}{filtersActive && members.filter(m => m.chamber === "House").length !== filteredHouse.length ? ` of ${members.filter(m => m.chamber === "House").length}` : ""} members)
              </p>
              <div className="space-y-1.5">
                {filteredHouse.map(m => <MemberRow key={m.bioguideId} member={m} existingNames={existingNames} addedIds={addedIds} addingIds={addingIds} onAdd={handleAdd} />)}
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground/60">Data from <a href="https://api.congress.gov" target="_blank" rel="noopener noreferrer" className="underline">Congress.gov</a></p>
    </div>
  );
}

function MemberRow({
  member, existingNames, addedIds, addingIds, onAdd,
}: {
  member: CongressMember;
  existingNames: Set<string>;
  addedIds: Set<string>;
  addingIds: Set<string>;
  onAdd: (m: CongressMember) => Promise<void>;
}) {
  const alreadyExists = existingNames.has(member.name.toLowerCase().trim());
  const justAdded = addedIds.has(member.bioguideId);
  const isAdding = addingIds.has(member.bioguideId);
  const done = alreadyExists || justAdded;

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card border">
      {member.imageUrl && (
        <img src={member.imageUrl} alt={member.name} className="w-8 h-8 rounded-full object-cover shrink-0 bg-secondary" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium">{member.name}</span>
          {member.party && (
            <Badge className={PARTY_COLORS[member.party] ?? "bg-secondary text-muted-foreground"}>{member.party}</Badge>
          )}
          {member.district && <Badge className="bg-secondary text-muted-foreground">Dist. {member.district}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{member.title}</p>
      </div>
      <button
        onClick={() => !done && !isAdding && onAdd(member)}
        disabled={done || isAdding}
        className={`shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
          done
            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 cursor-default"
            : isAdding
              ? "bg-secondary text-muted-foreground cursor-wait"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
        }`}
      >
        {isAdding ? <Loader2 size={11} className="animate-spin" /> : done ? <Check size={11} /> : <Plus size={11} />}
        {done ? (alreadyExists ? "In list" : "Added") : isAdding ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

// ── Voting Records components ──────────────────────────────────────────────────

function VoteRow({ vote, isFederal }: { vote: any; isFederal: boolean }) {
  const raw = (vote.memberVote ?? "").trim().toUpperCase();
  const voteColor =
    raw.startsWith("YEA") || raw === "YES" || raw === "AYE" || raw === "Y"
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
      : raw.startsWith("NAY") || raw === "NO" || raw === "N"
        ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20"
        : "text-muted-foreground bg-secondary";

  let dateStr = "";
  try { dateStr = vote.voteDate ? format(new Date(vote.voteDate), "MMM d, yyyy") : ""; } catch { dateStr = vote.voteDate ?? ""; }

  return (
    <div className="flex items-start gap-2.5 py-2 border-b last:border-0">
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${voteColor}`}>
        {vote.memberVote || "—"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-xs font-medium">{vote.billNumber}</span>
          {dateStr && <span className="text-[10px] text-muted-foreground">{dateStr}</span>}
        </div>
        {vote.billDescription && (
          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">{vote.billDescription}</p>
        )}
      </div>
      {vote.url && (
        <a href={vote.url} target="_blank" rel="noopener noreferrer"
          className="shrink-0 text-primary hover:text-primary/70 transition-colors mt-1"
          title="View on LegiScan">
          <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}

function VotingRecords({ official }: { official: PoliticalOfficial }) {
  const isFederal = official.level?.toLowerCase() === "federal";
  const isState = official.level?.toLowerCase() === "state";

  // For LegiScan lookups, we use name-based matching — no real bioguideId required
  const extId: string | null | undefined = (official as any).externalId;
  const isWimrId = !!extId?.startsWith("wimr-");
  const hasFederalName = isFederal && !!official.name;

  const [shown, setShown] = useState(false);
  const [cachedPeopleId, setCachedPeopleId] = useState<string | null>(
    extId && isState && !isWimrId ? extId : null
  );
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Both federal and state use LegiScan name lookup; need a name to proceed
  const enabled = shown && (isFederal ? hasFederalName : isState);

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["votes", official.id, cachedPeopleId],
    queryFn: async () => {
      setFetchError(null);
      try {
        if (isFederal) {
          const idSegment = (extId && !isWimrId) ? extId : "lookup";
          const p = new URLSearchParams();
          if (official.name) p.set("name", official.name);
          if (official.title) p.set("title", official.title);
          const r = await apiRequest("GET", `/api/politics/votes/federal/${idSegment}?${p}`);
          return r.json();
        }
        // State: use cached peopleId or auto-lookup by name+stateCode
        const params = new URLSearchParams();
        const pid = cachedPeopleId ?? (extId && !isWimrId ? extId : undefined);
        if (pid) params.set("peopleId", pid);
        if (official.name) params.set("name", official.name);
        if ((official as any).stateCode) params.set("stateCode", (official as any).stateCode);
        const r = await apiRequest("GET", `/api/politics/votes/state?${params}`);
        const body = await r.json();
        if (body.peopleId && body.peopleId !== cachedPeopleId) setCachedPeopleId(body.peopleId);
        return body.votes ?? body;
      } catch (e: any) {
        const msg: string = e?.message ?? String(e);
        setFetchError(msg);
        throw e;
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!isFederal && !isState) return null;

  const votes: any[] = Array.isArray(data) ? data : [];

  return (
    <div className="mt-3">
      <button
        onClick={() => setShown(s => !s)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <Vote size={12} />
        {shown ? "Hide" : "Show"} recent votes
        {shown ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {shown && (
        <div className="mt-2">
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 size={12} className="animate-spin" />Loading voting record…
            </div>
          )}
          {isError && (
            <div className="py-2 space-y-1">
              <p className="text-xs text-destructive">Could not load voting record.</p>
              {fetchError && <p className="text-[11px] text-destructive/70 font-mono break-all">{fetchError}</p>}
            </div>
          )}
          {!isLoading && !isError && votes.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">No voting records found.</p>
          )}
          {votes.length > 0 && (
            <div className="mt-1">
              <p className="text-[10px] text-muted-foreground/60 mb-1.5 uppercase tracking-wider font-semibold">
                {votes.length} most recent votes · {isFederal ? (official.title?.toLowerCase().includes("senator") ? "Senate.gov" : "Clerk.house.gov") : "LegiScan"}
              </p>
              <div>
                {votes.map((v, i) => <VoteRow key={i} vote={v} isFederal={isFederal} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Campaign Finance component ────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function CampaignFinance({ official }: { official: PoliticalOfficial }) {
  const isFederal = official.level?.toLowerCase() === "federal";
  const extId: string | null | undefined = (official as any).externalId;
  // FEC lookup only needs name+state+office — works even without a bioguideId
  const canLookup = isFederal && !!official.name;

  const [shown, setShown] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fecOffice = official.title?.toLowerCase().includes("senator") ? "S" : "H";
  const stateCode = (official as any).stateCode ?? "";
  const idSegment = (extId && !extId.startsWith("wimr-")) ? extId : "lookup";

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["finance", official.id],
    queryFn: async () => {
      setFetchError(null);
      try {
        const p = new URLSearchParams();
        if (official.name)  p.set("name",   official.name);
        if (stateCode)      p.set("state",  stateCode);
        p.set("office", fecOffice);
        const r = await apiRequest("GET", `/api/politics/finance/federal/${idSegment}?${p}`);
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(`${r.status}: ${JSON.stringify(body)}`);
        }
        return r.json();
      } catch (e: any) {
        setFetchError(e?.message ?? String(e));
        throw e;
      }
    },
    enabled: shown && canLookup,
    staleTime: 30 * 60 * 1000, // 30 min — FEC data doesn't change often
    retry: false,
  });

  if (!canLookup) return null;

  const totalRaised     = data?.totalRaised     ?? 0;
  const individualTotal = data?.individualTotal ?? 0;
  const pacTotal        = data?.pacTotal        ?? 0;
  const otherTotal      = Math.max(0, totalRaised - individualTotal - pacTotal);
  const indivPct  = totalRaised > 0 ? Math.round((individualTotal / totalRaised) * 100) : 0;
  const pacPct    = totalRaised > 0 ? Math.round((pacTotal        / totalRaised) * 100) : 0;
  const otherPct  = totalRaised > 0 ? Math.round((otherTotal      / totalRaised) * 100) : 0;
  const cycleLabel = data?.cycle ? `${data.cycle - 1}–${data.cycle}` : "";

  return (
    <div className="mt-3">
      <button
        onClick={() => setShown(s => !s)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <DollarSign size={12} />
        {shown ? "Hide" : "Show"} campaign finance
        {shown ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {shown && (
        <div className="mt-2">
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 size={12} className="animate-spin" />Loading campaign finance…
            </div>
          )}
          {isError && (
            <div className="py-2 space-y-1">
              <p className="text-xs text-destructive">Could not load campaign finance data.</p>
              {fetchError && <p className="text-[11px] text-destructive/70 font-mono break-all">{fetchError}</p>}
            </div>
          )}
          {!isLoading && !isError && data && (
            <div className="mt-1 space-y-3">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold">
                FEC · {cycleLabel} election cycle
              </p>

              {/* Total raised */}
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold">{fmt$(totalRaised)}</span>
                <span className="text-xs text-muted-foreground">total raised</span>
              </div>

              {/* Funding breakdown bar — Individual / PAC / Other (transfers, party, loans…) */}
              {totalRaised > 0 && (
                <div className="space-y-1.5">
                  <div className="flex h-2 rounded-full overflow-hidden bg-secondary">
                    <div className="bg-blue-500 transition-all" style={{ width: `${indivPct}%` }} />
                    <div className="bg-amber-500 transition-all" style={{ width: `${pacPct}%` }} />
                    <div className="bg-slate-400 transition-all" style={{ width: `${otherPct}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm bg-blue-500 shrink-0" />
                      <span className="text-muted-foreground">Individual</span>
                      <span className="font-medium">{fmt$(individualTotal)}</span>
                      <span className="text-muted-foreground">({indivPct}%)</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm bg-amber-500 shrink-0" />
                      <span className="text-muted-foreground">PAC</span>
                      <span className="font-medium">{fmt$(pacTotal)}</span>
                      <span className="text-muted-foreground">({pacPct}%)</span>
                    </span>
                    {otherTotal > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm bg-slate-400 shrink-0" />
                        <span className="text-muted-foreground">Other</span>
                        <span className="font-medium">{fmt$(otherTotal)}</span>
                        <span className="text-muted-foreground">({otherPct}%)</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Top individual donors */}
              {data.topDonors?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Top donors</p>
                  <div className="space-y-1.5">
                    {data.topDonors.map((d: any, i: number) => {
                      const maxAmt = data.topDonors[0]?.amount ?? 1;
                      const tc = (s: string) => s.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                      const detail = [d.occupation, d.employer].filter((s: string) => s && !["N/A","NONE","RETIRED","SELF-EMPLOYED","HOMEMAKER","NOT EMPLOYED","INFORMATION REQUESTED"].includes((s ?? "").toUpperCase())).map(tc).join(" · ");
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[11px] font-medium truncate block">{tc(d.name)}</span>
                              {detail && <span className="text-[9px] text-muted-foreground/70 truncate block">{detail}</span>}
                            </div>
                            <span className="text-[11px] font-semibold text-primary shrink-0">{fmt$(d.amount)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-primary/15 overflow-hidden">
                            <div className="h-full bg-primary/50 rounded-full" style={{ width: `${Math.round((d.amount / maxAmt) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top individuals from organizations */}
              {data.topOrgDonors?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Top individual donors from organizations</p>
                  <div className="space-y-1.5">
                    {data.topOrgDonors.map((d: any, i: number) => {
                      const maxAmt = data.topOrgDonors[0]?.amount ?? 1;
                      const tc = (s: string) => s.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                      return (
                        <div key={i} className="rounded-md border bg-secondary/30 p-2 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold truncate">{tc(d.name)}</p>
                              <p className="text-[10px] text-primary/80 font-medium truncate">{tc(d.employer)}</p>
                              {d.occupation && !["N/A","NONE"].includes(d.occupation.toUpperCase()) && <p className="text-[9px] text-muted-foreground/60 truncate">{tc(d.occupation)}</p>}
                            </div>
                            <span className="text-[12px] font-bold text-emerald-400 shrink-0">{fmt$(d.amount)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-emerald-400/15 overflow-hidden">
                            <div className="h-full bg-emerald-400/50 rounded-full" style={{ width: `${Math.round((d.amount / maxAmt) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top PAC / company donors */}
              {data.topPacDonors?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Top company &amp; PAC donors</p>
                  <div className="space-y-1.5">
                    {data.topPacDonors.map((d: any, i: number) => {
                      const maxAmt = data.topPacDonors[0]?.amount ?? 1;
                      const tc = (s: string) => s.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                      const displayName = tc(d.name.replace(/\bPAC\b|\bSUPER PAC\b|\bFUND\b|\bCOMMITTEE\b/gi, "").trim().replace(/\s+/g, " "));
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium truncate" title={tc(d.name)}>{displayName}</span>
                            <span className="text-[11px] font-semibold text-amber-400 shrink-0">{fmt$(d.amount)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-amber-400/15 overflow-hidden">
                            <div className="h-full bg-amber-400/60 rounded-full" style={{ width: `${Math.round((d.amount / maxAmt) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top employers of contributors */}
              {data.topContributors?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Top employers of contributors</p>
                  <div className="space-y-1">
                    {data.topContributors.slice(0, 5).map((c: any, i: number) => {
                      const barPct = data.topContributors[0]?.total > 0 ? Math.round((c.total / data.topContributors[0].total) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[11px] font-medium truncate">{c.name}</span>
                              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{fmt$(c.total)}</span>
                            </div>
                            <div className="h-1 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full bg-primary/40 rounded-full" style={{ width: `${barPct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <a href={data.fecUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors">
                <ExternalLink size={10} />FEC.gov · {data.candidateName}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Campaign Spending (Representatives) ───────────────────────────────────────

function CampaignSpending({ official }: { official: PoliticalOfficial }) {
  const isFederal = official.level?.toLowerCase() === "federal";
  const canLookup = isFederal && !!official.name;
  const [shown, setShown] = useState(false);
  const fecOffice = official.title?.toLowerCase().includes("senator") ? "S" : "H";
  const stateCode = (official as any).stateCode ?? "";

  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: ["spending", official.id],
    queryFn: async () => {
      const p = new URLSearchParams({ name: official.name, state: stateCode, office: fecOffice });
      const r = await apiRequest("GET", `/api/politics/spending/federal?${p}`);
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error ?? `${r.status}`); }
      return r.json();
    },
    enabled: shown && canLookup,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  if (!canLookup) return null;

  const sp = data ?? {};
  const categories: any[] = sp.byPurpose ?? [];
  const totalSpent: number = sp.totalDisbursements ?? 0;
  const topVendors: any[] = sp.topVendors ?? [];
  const maxCat = categories[0]?.total ?? 1;

  return (
    <div className="mt-3">
      <button onClick={() => setShown(s => !s)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
        <TrendingDown size={12} />
        {shown ? "Hide" : "Show"} campaign spending
        {shown ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {shown && (
        <div className="mt-2 space-y-3">
          {isLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 size={12} className="animate-spin" />Loading spending data…</div>}
          {isError && <p className="text-xs text-destructive py-1">{(error as Error)?.message ?? "Could not load spending data."}</p>}
          {!isLoading && !isError && data && (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold">{fmt$(totalSpent)}</span>
                <span className="text-xs text-muted-foreground">total spent · {sp.cycleLabel ?? ""}</span>
              </div>

              {categories.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Spending by category</p>
                  <div className="space-y-1.5">
                    {categories.map((c: any, i: number) => {
                      const pct = totalSpent > 0 ? Math.round((c.total / totalSpent) * 100) : 0;
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium truncate">{c.purpose}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[9px] text-muted-foreground">{pct}%</span>
                              <span className="text-[11px] font-semibold">{fmt$(c.total)}</span>
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-primary/15 overflow-hidden">
                            <div className="h-full bg-primary/50 rounded-full" style={{ width: `${Math.round((c.total / maxCat) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {topVendors.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Top vendors paid</p>
                  <div className="space-y-1.5">
                    {topVendors.map((v: any, i: number) => {
                      const tc = (s: string) => s.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                      const maxV = topVendors[0]?.total ?? 1;
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-medium truncate">{tc(v.name)}</p>
                              {v.purpose && <p className="text-[9px] text-muted-foreground/60 truncate">{v.purpose}</p>}
                            </div>
                            <span className="text-[11px] font-semibold text-amber-400 shrink-0">{fmt$(v.total)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-amber-400/15 overflow-hidden">
                            <div className="h-full bg-amber-400/50 rounded-full" style={{ width: `${Math.round((v.total / maxV) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {sp.fecUrl && (
                <a href={sp.fecUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors">
                  <ExternalLink size={10} />View full FEC disbursements
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Government Spending in Representative's State/District ───────────────────

function GovernmentSpending({ official }: { official: PoliticalOfficial }) {
  const isFederal = official.level?.toLowerCase() === "federal";
  const canLookup = isFederal && !!((official as any).stateCode);
  const [shown, setShown] = useState(false);
  const stateCode = (official as any).stateCode ?? "";
  const isSenate  = official.title?.toLowerCase().includes("senator");
  const fecOffice = isSenate ? "S" : "H";
  const district  = (official as any).district ?? "";

  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: ["gov-spending", official.id],
    queryFn: async () => {
      const p = new URLSearchParams({ state: stateCode, office: fecOffice });
      if (district) p.set("district", String(district).replace(/\D/g, ""));
      const r = await apiRequest("GET", `/api/politics/spending/government?${p}`);
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error ?? `${r.status}`); }
      return r.json();
    },
    enabled: shown && canLookup,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  if (!canLookup) return null;

  const sp = data ?? {};
  const totalSpending: number  = sp.totalSpending    ?? 0;
  const awardTypes: any[]      = sp.awardTypeAmounts ?? [];
  const programs: any[]        = sp.topPrograms      ?? [];
  const agencies: any[]        = sp.topAgencies      ?? [];
  const recipients: any[]      = sp.recipientTypes   ?? [];
  const maxProgram   = programs[0]?.amount   ?? 1;
  const maxAgency    = agencies[0]?.amount   ?? 1;
  const maxRecipient = recipients[0]?.amount ?? 1;

  const typeBarColor: Record<string, string> = {
    "Contracts":       "bg-blue-500",
    "Grants":          "bg-emerald-500",
    "Direct Payments": "bg-orange-500",
    "Loans":           "bg-purple-500",
  };

  const SpendingBar = ({ amount, max, color }: { amount: number; max: number; color: string }) => (
    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.max(2, (amount / max) * 100)}%` }} />
    </div>
  );

  return (
    <div className="mt-3">
      <button onClick={() => setShown(s => !s)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
        <Landmark size={12} />
        {shown ? "Hide" : "Show"} federal spending in {isSenate ? `${stateCode} (statewide)` : `district ${district}`}
        {shown ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {shown && (
        <div className="mt-2 space-y-4">
          {isLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 size={12} className="animate-spin" />Loading federal spending data…</div>}
          {isError  && <p className="text-xs text-destructive py-1">{(error as Error)?.message ?? "Could not load spending data."}</p>}
          {!isLoading && !isError && data && (
            <>
              {/* ── Header ── */}
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold">{fmt$(totalSpending)}</span>
                  <span className="text-xs text-muted-foreground">in {sp.state} (statewide) · FY{sp.fiscalYear}</span>
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                  Total federal awards in state · Programs &amp; agencies below
                  {sp.hasDistrict ? ` filtered to district ${sp.district}` : ""} · Source: USASpending.gov
                </p>
              </div>

              {/* ── Where the money goes (by type) ── */}
              {awardTypes.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Where the money goes</p>
                  <div className="space-y-2.5">
                    {awardTypes.map((t: any) => (
                      <div key={t.label}>
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${typeBarColor[t.label] ?? "bg-primary"}`} />
                            <span className="text-[11px] font-semibold">{t.label}</span>
                            <span className="text-[10px] text-muted-foreground truncate">{t.description}</span>
                          </div>
                          <span className="text-[11px] font-bold shrink-0 ml-2">{fmt$(t.amount)}</span>
                        </div>
                        <div className="ml-3.5">
                          <SpendingBar amount={t.amount} max={totalSpending || 1} color={typeBarColor[t.label] ?? "bg-primary"} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Top federal programs (CFDA) ── */}
              {programs.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Spending by program{sp.hasDistrict ? ` · district ${sp.district}` : ""}
                  </p>
                  <div className="rounded-md border border-border/50 overflow-hidden divide-y divide-border/40">
                    {programs.map((p: any, i: number) => (
                      <div key={i} className="px-2.5 py-2 space-y-1 bg-card hover:bg-secondary/20 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[11px] font-semibold block truncate">{p.name}</span>
                            {p.code && <span className="text-[9px] text-muted-foreground/50">CFDA {p.code}</span>}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[12px] font-bold block">{fmt$(p.amount)}</span>
                            {p.pct != null && <span className="text-[9px] text-muted-foreground">{p.pct}% of top programs</span>}
                          </div>
                        </div>
                        <SpendingBar amount={p.amount} max={maxProgram} color="bg-emerald-500/70" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Top awarding agencies ── */}
              {agencies.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top federal agencies</p>
                  <div className="space-y-2">
                    {agencies.map((a: any, i: number) => (
                      <div key={i}>
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[11px] font-medium truncate">{a.name}</span>
                          <span className="text-[11px] font-bold shrink-0">{fmt$(a.amount)}</span>
                        </div>
                        <SpendingBar amount={a.amount} max={maxAgency} color="bg-blue-500/60" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Who receives the money ── */}
              {recipients.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Who receives it</p>
                  <div className="space-y-2">
                    {recipients.map((r: any, i: number) => (
                      <div key={i}>
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[11px] font-medium truncate">{r.label}</span>
                          <span className="text-[11px] font-bold shrink-0">{fmt$(r.amount)}</span>
                        </div>
                        <SpendingBar amount={r.amount} max={maxRecipient} color="bg-amber-500/60" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sp.usaSpendingUrl && (
                <a href={sp.usaSpendingUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors">
                  <ExternalLink size={10} />View full profile on USASpending.gov
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Civic Elections Lookup ────────────────────────────────────────────────────

function LocationCard({ loc }: { loc: any }) {
  const addr = [loc.line1, loc.line2, loc.city, loc.state, loc.zip].filter(Boolean).join(", ");
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5 space-y-1">
      {loc.name && <p className="text-xs font-semibold">{loc.name}</p>}
      {addr && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-start gap-1.5 text-[11px] text-primary hover:underline"
        >
          <MapPin size={11} className="mt-0.5 shrink-0" />{addr}
        </a>
      )}
      {loc.hours && <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock size={11} />{loc.hours}</p>}
      {(loc.startDate || loc.endDate) && (
        <p className="text-[11px] text-muted-foreground">
          {loc.startDate && loc.endDate ? `${loc.startDate} – ${loc.endDate}` : loc.startDate ?? loc.endDate}
        </p>
      )}
      {loc.notes && <p className="text-[11px] text-muted-foreground italic">{loc.notes}</p>}
    </div>
  );
}

// ── Upcoming Elections Panel ───────────────────────────────────────────────────

// ── FEC name normalizer ────────────────────────────────────────────────────────
// FEC returns names as "LAST, FIRST MIDDLE NICK" — convert to "First Last" for URLs & display

function normalizeFecName(raw: string): string {
  const tc = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (raw.includes(",")) {
    const [last, rest = ""] = raw.split(",");
    const first = rest.trim().split(/\s+/)[0] ?? "";
    return [first, last].filter(Boolean).map(tc).join(" ");
  }
  return raw.split(/\s+/).map(tc).join(" ");
}

// Build external search URLs from a normalized name
function ballotpediaUrl(rawName: string): string {
  // Use Ballotpedia search so any name variant finds the right politician
  return `https://ballotpedia.org/wiki/index.php?search=${encodeURIComponent(normalizeFecName(rawName))}`;
}

// ── Policy topic categorization (client-side) ─────────────────────────────────

const POLICY_BUCKETS: Array<{
  label: string; emoji: string; keywords: string[];
  forLabel: string;     // What voting FOR bills in this area typically means
  againstLabel: string; // What voting AGAINST typically means
}> = [
  { label: "Healthcare",         emoji: "🏥",
    keywords: ["health", "medical", "medicare", "medicaid", "prescription", "drug", "hospital", "insurance", "opioid", "affordable care", "mental health"],
    forLabel:     "Expand healthcare coverage & access",
    againstLabel: "Limit healthcare mandates & spending" },
  { label: "Economy & Taxes",    emoji: "💵",
    keywords: ["tax", "budget", "fiscal", "deficit", "debt", "trade", "tariff", "jobs", "employment", "wage", "workforce", "small business", "economic"],
    forLabel:     "Support economic programs & spending",
    againstLabel: "Cut spending & oppose fiscal programs" },
  { label: "Defense & Veterans", emoji: "🎖️",
    keywords: ["defense", "military", "veteran", "armed forces", "national security", "army", "navy", "air force", "pentagon"],
    forLabel:     "Increase defense & veterans' funding",
    againstLabel: "Reduce defense budget & military spending" },
  { label: "Environment",        emoji: "🌿",
    keywords: ["climate", "energy", "clean", "environment", "epa", "emissions", "carbon", "oil", "gas", "renewable", "solar", "wind", "conservation"],
    forLabel:     "Support climate action & clean energy",
    againstLabel: "Oppose climate regulations & green mandates" },
  { label: "Immigration",        emoji: "🌐",
    keywords: ["immigr", "border", "asylum", "daca", "refugee", "visa", "citizenship", "undocumented"],
    forLabel:     "Support immigration pathways & protections",
    againstLabel: "Restrict immigration & tighten border security" },
  { label: "Education",          emoji: "📚",
    keywords: ["education", "school", "student", "university", "college", "loan", "teacher", "pell", "literacy"],
    forLabel:     "Expand education funding & student aid",
    againstLabel: "Reduce federal education spending & control" },
  { label: "Gun Policy",         emoji: "🔫",
    keywords: ["gun", "firearm", "second amendment", "background check", "weapon", "atf", "ammunition"],
    forLabel:     "Pro-gun rights & 2nd Amendment",
    againstLabel: "Support gun safety measures & restrictions" },
  { label: "Foreign Policy",     emoji: "🌍",
    keywords: ["foreign", "israel", "ukraine", "china", "russia", "nato", "diplomacy", "sanction", "international aid", "overseas"],
    forLabel:     "Support foreign engagement & international aid",
    againstLabel: "Oppose foreign aid & overseas intervention" },
  { label: "Criminal Justice",   emoji: "⚖️",
    keywords: ["crime", "criminal", "justice", "police", "law enforcement", "prison", "sentencing", "fentanyl"],
    forLabel:     "Tough on crime & support law enforcement",
    againstLabel: "Support criminal justice reform & rehabilitation" },
  { label: "Social Issues",      emoji: "🤝",
    keywords: ["abortion", "lgbtq", "civil rights", "discrimination", "women", "gender", "reproductive", "equality"],
    forLabel:     "Support civil rights & social justice measures",
    againstLabel: "Oppose social justice legislation" },
];

function categorizeVotes(votes: any[]): Array<{
  label: string; emoji: string; yea: number; nay: number;
  forLabel: string; againstLabel: string;
  examples: Array<{ text: string; vote: string }>;
}> {
  return POLICY_BUCKETS.map(bucket => {
    const matching = votes.filter(v => {
      const text = `${v.billNumber ?? ""} ${v.billDescription ?? ""}`.toLowerCase();
      return bucket.keywords.some(kw => text.includes(kw));
    });
    const yea = matching.filter(v => /\byea\b|\byes\b|\baye\b/i.test(v.memberVote ?? "")).length;
    const nay = matching.filter(v => /\bnay\b|\bno\b/i.test(v.memberVote ?? "")).length;
    const examples = matching
      .slice(0, 3)
      .map(v => ({ text: (v.billDescription || v.billNumber || "").trim(), vote: (v.memberVote || "").trim() }))
      .filter(e => e.text);
    return { ...bucket, yea, nay, examples };
  }).filter(b => b.yea + b.nay > 0)
    .sort((a, b) => (b.yea + b.nay) - (a.yea + a.nay));
}

// ── Government spending for election candidates ────────────────────────────────

function CandidateGovernmentSpending({
  stateCode, isSenate, district,
}: {
  stateCode: string; isSenate: boolean; district?: string;
}) {
  const fecOffice = isSenate ? "S" : "H";
  const districtNum = district ? String(district).replace(/\D/g, "") : "";

  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: ["gov-spending-cand", stateCode, fecOffice, districtNum],
    queryFn: async () => {
      const p = new URLSearchParams({ state: stateCode, office: fecOffice });
      if (districtNum) p.set("district", districtNum);
      const r = await apiRequest("GET", `/api/politics/spending/government?${p}`);
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error ?? `${r.status}`); }
      return r.json();
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const sp = data ?? {};
  const totalSpending: number  = sp.totalSpending    ?? 0;
  const awardTypes: any[]      = sp.awardTypeAmounts ?? [];
  const programs: any[]        = sp.topPrograms      ?? [];
  const agencies: any[]        = sp.topAgencies      ?? [];
  const recipients: any[]      = sp.recipientTypes   ?? [];
  const maxProgram   = programs[0]?.amount   ?? 1;
  const maxAgency    = agencies[0]?.amount   ?? 1;
  const maxRecipient = recipients[0]?.amount ?? 1;

  const typeBarColor: Record<string, string> = {
    "Contracts":       "bg-blue-500",
    "Grants":          "bg-emerald-500",
    "Direct Payments": "bg-orange-500",
    "Loans":           "bg-purple-500",
  };

  const SpendingBar = ({ amount, max, color }: { amount: number; max: number; color: string }) => (
    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.max(2, (amount / max) * 100)}%` }} />
    </div>
  );

  if (isLoading) return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-3 px-1">
      <Loader2 size={12} className="animate-spin" />Loading federal spending data…
    </div>
  );
  if (isError) return (
    <p className="text-xs text-destructive py-2 px-1">{(error as Error)?.message ?? "Could not load spending data."}</p>
  );
  if (!data) return (
    <p className="text-[11px] text-muted-foreground italic py-2 px-1">No spending data available.</p>
  );

  return (
    <div className="px-3 py-2.5 space-y-4">
      {/* ── Header ── */}
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold">{fmt$(totalSpending)}</span>
          <span className="text-xs text-muted-foreground">in {sp.state} · FY{sp.fiscalYear}</span>
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5">
          Federal awards {isSenate ? "statewide" : districtNum ? `district ${districtNum}` : "statewide"}
          {sp.hasDistrict ? ` filtered to district ${sp.district}` : ""} · Source: USASpending.gov
        </p>
      </div>

      {/* ── Where the money goes ── */}
      {awardTypes.length > 0 && (
        <div>
          <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Where the money goes</p>
          <div className="space-y-2.5">
            {awardTypes.map((t: any) => (
              <div key={t.label}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${typeBarColor[t.label] ?? "bg-primary"}`} />
                    <span className="text-[11px] font-semibold">{t.label}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{t.description}</span>
                  </div>
                  <span className="text-[11px] font-bold shrink-0 ml-2">{fmt$(t.amount)}</span>
                </div>
                <div className="ml-3.5">
                  <SpendingBar amount={t.amount} max={totalSpending || 1} color={typeBarColor[t.label] ?? "bg-primary"} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top federal programs ── */}
      {programs.length > 0 && (
        <div>
          <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">
            Spending by program{sp.hasDistrict ? ` · district ${sp.district}` : ""}
          </p>
          <div className="rounded-md border border-border/50 overflow-hidden divide-y divide-border/40">
            {programs.map((p: any, i: number) => (
              <div key={i} className="px-2.5 py-2 space-y-1 bg-card hover:bg-secondary/20 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold block truncate">{p.name}</span>
                    {p.code && <span className="text-[9px] text-muted-foreground/50">CFDA {p.code}</span>}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[12px] font-bold block">{fmt$(p.amount)}</span>
                    {p.pct != null && <span className="text-[9px] text-muted-foreground">{p.pct}% of top</span>}
                  </div>
                </div>
                <SpendingBar amount={p.amount} max={maxProgram} color="bg-emerald-500/70" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top awarding agencies ── */}
      {agencies.length > 0 && (
        <div>
          <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Top federal agencies</p>
          <div className="space-y-2">
            {agencies.map((a: any, i: number) => (
              <div key={i}>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[11px] font-medium truncate">{a.name}</span>
                  <span className="text-[11px] font-bold shrink-0">{fmt$(a.amount)}</span>
                </div>
                <SpendingBar amount={a.amount} max={maxAgency} color="bg-blue-500/60" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Who receives the money ── */}
      {recipients.length > 0 && (
        <div>
          <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Who receives it</p>
          <div className="space-y-2">
            {recipients.map((r: any, i: number) => (
              <div key={i}>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[11px] font-medium truncate">{r.label}</span>
                  <span className="text-[11px] font-bold shrink-0">{fmt$(r.amount)}</span>
                </div>
                <SpendingBar amount={r.amount} max={maxRecipient} color="bg-amber-500/60" />
              </div>
            ))}
          </div>
        </div>
      )}

      {sp.usaSpendingUrl && (
        <a href={sp.usaSpendingUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors">
          <ExternalLink size={10} />View full profile on USASpending.gov
        </a>
      )}
    </div>
  );
}

// ── Per-candidate Finance + Votes + Positions panel ───────────────────────────

function CandidateDetails({
  candidate, office, stateCode, district,
}: {
  candidate: any; office: string; stateCode: string; isFecSource: boolean; district?: string;
}) {
  const [tab, setTab] = useState<"finance" | "spending" | "votes" | "positions" | "gov">("finance");
  const [aiSummary, setAiSummary]     = useState<string | null>(null);
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiError,   setAiError]       = useState<string | null>(null);
  const isSenate  = /senate/i.test(office);
  const title     = isSenate ? "Senator" : "Representative";
  const fecOffice = isSenate ? "S" : "H";

  // Finance query
  const finQuery = useQuery<any>({
    queryKey: ["cand-finance", candidate.name, stateCode, fecOffice],
    queryFn: async () => {
      const p = new URLSearchParams({ name: candidate.name, state: stateCode, office: fecOffice });
      const r = await apiRequest("GET", `/api/politics/finance/federal/lookup?${p}`);
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error ?? `${r.status}`); }
      return r.json();
    },
    enabled: tab === "finance",
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // Normalize FEC name ("LAST, FIRST MIDDLE" → "First Last") for APIs and URLs
  const displayName = normalizeFecName(candidate.name);

  // Votes query — also enabled when Positions tab is open (needed for topic analysis)
  const votesQuery = useQuery<any>({
    queryKey: ["cand-votes", candidate.name, title],
    queryFn: async () => {
      // Pass raw FEC name so server can extract all possible first initials
      const p = new URLSearchParams({ name: candidate.name, title });
      const r = await apiRequest("GET", `/api/politics/votes/federal/lookup?${p}`);
      return r.json();
    },
    enabled: tab === "votes" || tab === "positions",
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Congress.gov member profile — sponsored bills + committees
  const profileQuery = useQuery<any>({
    queryKey: ["cand-profile", candidate.name, stateCode, fecOffice],
    queryFn: async () => {
      const p = new URLSearchParams({ name: candidate.name, state: stateCode, office: fecOffice });
      const r = await apiRequest("GET", `/api/politics/congress/member-profile?${p}`);
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error ?? `${r.status}`); }
      return r.json();
    },
    enabled: tab === "positions",
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // Spending query — FEC Schedule B disbursements by purpose
  const spendingQuery = useQuery<any>({
    queryKey: ["cand-spending", candidate.name, stateCode, fecOffice],
    queryFn: async () => {
      const p = new URLSearchParams({ name: candidate.name, state: stateCode, office: fecOffice });
      const r = await apiRequest("GET", `/api/politics/spending/federal?${p}`);
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error ?? `${r.status}`); }
      return r.json();
    },
    enabled: tab === "spending",
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const fin = finQuery.data;
  const totalRaised     = fin?.totalRaised     ?? 0;
  const individualTotal = fin?.individualTotal ?? 0;
  const pacTotal        = fin?.pacTotal        ?? 0;
  const otherTotal      = Math.max(0, totalRaised - individualTotal - pacTotal);
  const indivPct  = totalRaised > 0 ? Math.round((individualTotal / totalRaised) * 100) : 0;
  const pacPct    = totalRaised > 0 ? Math.round((pacTotal        / totalRaised) * 100) : 0;
  const otherPct  = totalRaised > 0 ? Math.round((otherTotal      / totalRaised) * 100) : 0;
  const cycleLabel = fin?.cycle ? `${fin.cycle - 1}–${fin.cycle}` : "";
  const votes: any[] = Array.isArray(votesQuery.data) ? votesQuery.data : [];
  const topicBreakdown = categorizeVotes(votes);

  // Generate AI candidate summary
  const generateSummary = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    try {
      const topContributors = (fin?.topContributors ?? []).map((c: any) => ({ name: c.name, total: c.total }));
      const r = await apiRequest("POST", "/api/politics/candidate/summary", {
        displayName,
        office,
        state: stateCode,
        party: candidate.party ?? undefined,
        topContributors,
        topicBreakdown: topicBreakdown.map(b => ({
          label: b.label, yea: b.yea, nay: b.nay,
          examples: b.examples.slice(0, 2),
        })),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${r.status}`);
      }
      const data = await r.json();
      setAiSummary(data.summary ?? "No summary returned.");
    } catch (e: any) {
      setAiError(e.message ?? "Failed to generate summary.");
    } finally {
      setAiLoading(false);
    }
  };

  // Build external links using normalized "First Last" form of the FEC name
  const bpUrl = ballotpediaUrl(candidate.name);
  const vsUrl = `https://www.votesmart.org/candidates/search?query=${encodeURIComponent(displayName)}`;
  const cgUrl = `https://www.congress.gov/members?q=${encodeURIComponent(JSON.stringify({ search: displayName }))}`;

  const TABS = [
    { id: "finance",   label: "💰 Finance" },
    { id: "spending",  label: "💸 Campaign $" },
    { id: "gov",       label: "🏛️ Gov. Spending" },
    { id: "votes",     label: "🗳️ Votes" },
    { id: "positions", label: "📋 Positions" },
  ] as const;

  return (
    <div className="mt-2 rounded-lg border bg-secondary/20 overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-colors ${
              tab === t.id
                ? "bg-background border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* ── Finance tab ── */}
      {tab === "finance" && (
        <div className="px-3 py-2.5">
          {finQuery.isLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground py-1"><Loader2 size={11} className="animate-spin" />Loading…</div>}
          {finQuery.isError && <p className="text-[11px] text-destructive py-1">{(finQuery.error as any)?.message ?? "Could not load finance data."}</p>}
          {fin && totalRaised === 0 && <p className="text-[11px] text-muted-foreground italic py-1">No FEC finance data found for this candidate.</p>}
          {fin && totalRaised > 0 && (
            <div className="space-y-2.5">
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold">FEC · {cycleLabel}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-base font-bold">{fmt$(totalRaised)}</span>
                <span className="text-[11px] text-muted-foreground">total raised</span>
              </div>
              <div className="space-y-1">
                <div className="flex h-1.5 rounded-full overflow-hidden bg-secondary">
                  <div className="bg-blue-500" style={{ width: `${indivPct}%` }} />
                  <div className="bg-amber-500" style={{ width: `${pacPct}%` }} />
                  <div className="bg-slate-400" style={{ width: `${otherPct}%` }} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-blue-500" />Individual {fmt$(individualTotal)} ({indivPct}%)</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-amber-500" />PAC {fmt$(pacTotal)} ({pacPct}%)</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-slate-400" />Other {fmt$(otherTotal)} ({otherPct}%)</span>
                </div>
              </div>
              {/* Top 5 individual donors */}
              {fin.topDonors?.length > 0 && (
                <div>
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Top donors</p>
                  <div className="space-y-1.5">
                    {fin.topDonors.map((d: any, i: number) => {
                      const maxAmt = fin.topDonors[0]?.amount ?? 1;
                      const tc = (s: string) => s.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                      const donorName = tc(d.name);
                      const detail = [d.occupation, d.employer].filter((s: string) => s && !["N/A","NONE","RETIRED","SELF-EMPLOYED","HOMEMAKER","NOT EMPLOYED","INFORMATION REQUESTED"].includes((s ?? "").toUpperCase())).map(tc).join(" · ");
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[11px] font-medium truncate block">{donorName}</span>
                              {detail && <span className="text-[9px] text-muted-foreground/70 truncate block">{detail}</span>}
                            </div>
                            <span className="text-[11px] font-semibold text-primary shrink-0">{fmt$(d.amount)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-primary/15 overflow-hidden">
                            <div className="h-full bg-primary/50 rounded-full transition-all" style={{ width: `${Math.round((d.amount / maxAmt) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top individuals linked to organizations */}
              {fin.topOrgDonors?.length > 0 && (
                <div>
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Top individual donors from organizations</p>
                  <div className="space-y-2">
                    {fin.topOrgDonors.map((d: any, i: number) => {
                      const maxAmt = fin.topOrgDonors[0]?.amount ?? 1;
                      const tc = (s: string) => s.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                      const donorName  = tc(d.name);
                      const employer   = tc(d.employer);
                      const occupation = d.occupation && !["N/A","NONE"].includes(d.occupation.toUpperCase()) ? tc(d.occupation) : "";
                      return (
                        <div key={i} className="rounded-md border bg-secondary/30 p-2 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold truncate">{donorName}</p>
                              <p className="text-[10px] text-primary/80 font-medium truncate">{employer}</p>
                              {occupation && <p className="text-[9px] text-muted-foreground/60 truncate">{occupation}</p>}
                            </div>
                            <span className="text-[12px] font-bold text-emerald-400 shrink-0">{fmt$(d.amount)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-emerald-400/15 overflow-hidden">
                            <div className="h-full bg-emerald-400/50 rounded-full transition-all" style={{ width: `${Math.round((d.amount / maxAmt) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top PAC / company donors */}
              {fin.topPacDonors?.length > 0 && (
                <div>
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Top company &amp; PAC donors</p>
                  <div className="space-y-1.5">
                    {fin.topPacDonors.map((d: any, i: number) => {
                      const maxAmt = fin.topPacDonors[0]?.amount ?? 1;
                      const tc = (s: string) => s.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                      // Strip common PAC suffixes for cleaner display, keep original as tooltip
                      const displayName = tc(d.name.replace(/\bPAC\b|\bSUPER PAC\b|\bFUND\b|\bCOMMITTEE\b/gi, "").trim().replace(/\s+/g, " "));
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium truncate" title={tc(d.name)}>{displayName}</span>
                            <span className="text-[11px] font-semibold text-amber-400 shrink-0">{fmt$(d.amount)}</span>
                          </div>
                          <div className="h-1 rounded-full bg-amber-400/15 overflow-hidden">
                            <div className="h-full bg-amber-400/60 rounded-full transition-all" style={{ width: `${Math.round((d.amount / maxAmt) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top employers of contributors */}
              {fin.topContributors?.length > 0 && (
                <div>
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Top employers of contributors</p>
                  <div className="space-y-1">
                    {fin.topContributors.slice(0, 5).map((c: any, i: number) => {
                      const maxAmt = fin.topContributors[0]?.total ?? 1;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] truncate">{c.name}</div>
                            <div className="h-1 rounded-full bg-primary/20 mt-0.5 overflow-hidden">
                              <div className="h-full bg-primary/60 rounded-full" style={{ width: `${Math.round((c.total / maxAmt) * 100)}%` }} />
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">{fmt$(c.total)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {fin.fecUrl && (
                <a href={fin.fecUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                  <ExternalLink size={9} />View full FEC profile
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Spending tab ── */}
      {tab === "spending" && (
        <div className="px-3 py-2.5 space-y-3">
          {spendingQuery.isLoading && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-1">
              <Loader2 size={11} className="animate-spin" />Loading spending data…
            </div>
          )}
          {spendingQuery.isError && (
            <p className="text-[11px] text-muted-foreground italic py-1">{(spendingQuery.error as Error)?.message ?? "Could not load spending data."}</p>
          )}
          {spendingQuery.data && (() => {
            const sp = spendingQuery.data;
            const categories: any[] = sp.byPurpose ?? [];
            const totalSpent: number = sp.totalDisbursements ?? 0;
            const topVendors: any[] = sp.topVendors ?? [];
            const maxCat = categories[0]?.total ?? 1;
            return (
              <div className="space-y-3">
                {/* Total disbursements */}
                <div className="flex items-baseline gap-2">
                  <span className="text-[18px] font-bold">{fmt$(totalSpent)}</span>
                  <span className="text-[10px] text-muted-foreground">total spent · {sp.cycleLabel ?? ""}</span>
                </div>

                {/* Spending by category */}
                {categories.length > 0 && (
                  <div>
                    <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Spending by category</p>
                    <div className="space-y-1.5">
                      {categories.map((c: any, i: number) => {
                        const pct = totalSpent > 0 ? Math.round((c.total / totalSpent) * 100) : 0;
                        return (
                          <div key={i} className="space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium truncate">{c.purpose}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[9px] text-muted-foreground">{pct}%</span>
                                <span className="text-[11px] font-semibold">{fmt$(c.total)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 rounded-full bg-primary/15 overflow-hidden">
                              <div className="h-full bg-primary/50 rounded-full transition-all" style={{ width: `${Math.round((c.total / maxCat) * 100)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Top vendors */}
                {topVendors.length > 0 && (
                  <div>
                    <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Top vendors paid</p>
                    <div className="space-y-1.5">
                      {topVendors.map((v: any, i: number) => {
                        const tc = (s: string) => s.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
                        const maxV = topVendors[0]?.total ?? 1;
                        return (
                          <div key={i} className="space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[11px] font-medium truncate">{tc(v.name)}</p>
                                {v.purpose && <p className="text-[9px] text-muted-foreground/60 truncate">{v.purpose}</p>}
                              </div>
                              <span className="text-[11px] font-semibold text-amber-400 shrink-0">{fmt$(v.total)}</span>
                            </div>
                            <div className="h-1 rounded-full bg-amber-400/15 overflow-hidden">
                              <div className="h-full bg-amber-400/50 rounded-full transition-all" style={{ width: `${Math.round((v.total / maxV) * 100)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {sp.fecUrl && (
                  <a href={sp.fecUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                    <ExternalLink size={9} />View full FEC disbursements
                  </a>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Votes tab ── */}
      {tab === "votes" && (
        <div className="px-3 py-2.5">
          {votesQuery.isLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground py-1"><Loader2 size={11} className="animate-spin" />Loading…</div>}
          {votesQuery.isError && <p className="text-[11px] text-muted-foreground italic py-1">No voting record found — this candidate may not currently hold office.</p>}
          {!votesQuery.isLoading && !votesQuery.isError && votes.length === 0 && <p className="text-[11px] text-muted-foreground italic py-1">No recent votes found — this candidate may not currently hold federal office.</p>}
          {votes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold">{votes.length} recent votes</p>
              {votes.map((v: any, i: number) => <VoteRow key={i} vote={v} isFederal={true} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Positions tab ── */}
      {tab === "positions" && (
        <div className="px-3 py-2.5 space-y-3">

          {/* AI candidate overview */}
          <div className="rounded-lg border bg-secondary/20 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold">✨ AI Voter Overview</p>
                <p className="text-[9px] text-muted-foreground/70">Nonpartisan summary based on voting data & finance</p>
              </div>
              <button
                onClick={generateSummary}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {aiLoading ? <><Loader2 size={10} className="animate-spin" />Generating…</> : "Generate"}
              </button>
            </div>
            {aiError && (
              <p className="text-[10px] text-red-400 leading-snug">{aiError}</p>
            )}
            {aiSummary && (
              <div className="border-t border-border/30 pt-2 space-y-1">
                {aiSummary.split(/\n+/).filter(Boolean).map((para, i) => (
                  <p key={i} className="text-[11px] text-foreground/90 leading-relaxed">{para}</p>
                ))}
                <p className="text-[9px] text-muted-foreground/40 pt-0.5 italic">Generated by Claude AI · For informational purposes only</p>
              </div>
            )}
          </div>

          {/* Voting pattern by policy topic */}
          <div>
            <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">
              Voting pattern by issue {votes.length > 0 ? `· from ${votes.length} recent votes` : ""}
            </p>
            {votesQuery.isLoading && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 size={11} className="animate-spin" />Analyzing votes…
              </div>
            )}
            {!votesQuery.isLoading && topicBreakdown.length === 0 && (
              <p className="text-[11px] text-muted-foreground italic">
                {votesQuery.isError || votes.length === 0
                  ? "No voting record available — this candidate may not currently hold office."
                  : "No votes matched known policy topics."}
              </p>
            )}
            {topicBreakdown.length > 0 && (
              <div className="space-y-2">
                {topicBreakdown.map(b => {
                  const total = b.yea + b.nay;
                  const yeaPct = Math.round((b.yea / total) * 100);
                  const isFor     = yeaPct >= 65;
                  const isAgainst = yeaPct <= 35;
                  const stance    = isFor ? b.forLabel : isAgainst ? b.againstLabel : "Mixed record";
                  const stanceCls = isFor    ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                                  : isAgainst ? "text-red-400 bg-red-400/10 border-red-400/20"
                                  : "text-amber-400 bg-amber-400/10 border-amber-400/20";
                  return (
                    <div key={b.label} className="rounded-lg border bg-secondary/20 p-2.5 space-y-2">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[12px] font-semibold">{b.emoji} {b.label}</span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border text-right leading-snug ${stanceCls}`}>
                          {stance}
                        </span>
                      </div>

                      {/* Vote bar */}
                      <div className="flex h-2 rounded-full overflow-hidden bg-secondary">
                        <div className="bg-emerald-500 transition-all" style={{ width: `${yeaPct}%` }} />
                        <div className="bg-red-400 transition-all" style={{ width: `${100 - yeaPct}%` }} />
                      </div>

                      {/* Vote tally with context */}
                      <div className="flex justify-between text-[10px]">
                        <span className="text-emerald-400 font-medium">✓ {b.yea} yea{b.yea !== 1 ? "s" : ""}</span>
                        <span className="text-[9px] text-muted-foreground/50 italic truncate mx-2 hidden sm:block">{b.forLabel}</span>
                        <span className="text-red-400 font-medium">✗ {b.nay} nay{b.nay !== 1 ? "s" : ""}</span>
                      </div>
                      {/* What yea/nay actually means */}
                      <div className="grid grid-cols-2 gap-1 text-[9px]">
                        <div className="flex items-start gap-1 text-muted-foreground/60">
                          <span className="text-emerald-400/70 shrink-0 mt-px">✓</span>
                          <span className="leading-snug">{b.forLabel}</span>
                        </div>
                        <div className="flex items-start gap-1 text-muted-foreground/60">
                          <span className="text-red-400/70 shrink-0 mt-px">✗</span>
                          <span className="leading-snug">{b.againstLabel}</span>
                        </div>
                      </div>

                      {/* Example votes */}
                      {b.examples.length > 0 && (
                        <div className="border-t border-border/30 pt-2 space-y-1.5">
                          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Recent votes</p>
                          {b.examples.map((ex, i) => {
                            const isYea = /\byea\b|\byes\b|\baye\b/i.test(ex.vote);
                            const isNay = /\bnay\b|\bno\b/i.test(ex.vote);
                            return (
                              <div key={i} className="flex items-start gap-1.5">
                                <span className={`text-[10px] font-bold shrink-0 mt-px ${isYea ? "text-emerald-400" : isNay ? "text-red-400" : "text-muted-foreground"}`}>
                                  {isYea ? "✓" : isNay ? "✗" : "·"}
                                </span>
                                <p className="text-[10px] text-muted-foreground leading-snug">{ex.text}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Sponsored Legislation ── */}
          <div>
            <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">
              Legislation they've introduced
            </p>
            {profileQuery.isLoading && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 size={11} className="animate-spin" />Looking up sponsored bills…
              </div>
            )}
            {profileQuery.isError && (
              <p className="text-[11px] text-muted-foreground italic">
                No bill data found — this candidate may not currently hold federal office.
              </p>
            )}
            {profileQuery.data && (() => {
              const bills: any[] = profileQuery.data.bills ?? [];
              const committees: any[] = profileQuery.data.committees ?? [];
              const leadership: string[] = profileQuery.data.leadership ?? [];

              // Group bills by policy area
              const areaMap = new Map<string, any[]>();
              for (const b of bills) {
                const area = b.policyArea || "Other";
                if (!areaMap.has(area)) areaMap.set(area, []);
                areaMap.get(area)!.push(b);
              }
              const groupedBills = [...areaMap.entries()].sort((a, b) => b[1].length - a[1].length);

              return (
                <div className="space-y-3">
                  {/* Leadership roles */}
                  {leadership.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {leadership.map((l, i) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                          {l}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Bills by policy area */}
                  {bills.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">No sponsored bills found for this candidate.</p>
                  ) : (() => {
                    // Simplify boilerplate Senate/House action text into just the committee name
                    const summarizeAction = (action: string): string => {
                      const m = action.match(/referred to (?:the )?(.+?)\.?\s*$/i);
                      if (m) return `📋 ${m[1]}`;
                      if (/became public law/i.test(action)) return "✅ Signed into law";
                      if (/passed senate|passed house|passed by/i.test(action)) return "✅ Passed";
                      if (/vetoed/i.test(action)) return "❌ Vetoed";
                      return action.length > 80 ? action.slice(0, 80) + "…" : action;
                    };

                    return (
                      <div className="space-y-2">
                        {groupedBills.map(([area, areaBills]) => (
                          <div key={area} className="rounded-lg border bg-secondary/20 overflow-hidden">
                            <div className="flex items-center justify-between px-2.5 py-1.5 bg-secondary/40 border-b border-border/30">
                              <span className="text-[10px] font-semibold">{area}</span>
                              <span className="text-[9px] text-muted-foreground">{areaBills.length} bill{areaBills.length !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="divide-y divide-border/30">
                              {areaBills.map((b: any, i: number) => (
                                <div key={i} className="px-2.5 py-2 space-y-0.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-[11px] leading-snug font-medium flex-1">{b.title}</p>
                                    <span className="text-[9px] text-muted-foreground/60 shrink-0 font-mono">{b.number}</span>
                                  </div>
                                  {b.latestAction && (
                                    <p className="text-[9px] text-muted-foreground/60 leading-snug">{summarizeAction(b.latestAction)}</p>
                                  )}
                                  {b.introducedDate && (
                                    <p className="text-[9px] text-muted-foreground/40">Introduced {b.introducedDate}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Committee assignments */}
                  {committees.length > 0 && (
                    <div>
                      <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Committee assignments</p>
                      <div className="space-y-1">
                        {committees.map((c: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-secondary/30 border border-border/40">
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium truncate">{c.name}</p>
                              {c.rank && <p className="text-[9px] text-muted-foreground">{c.rank}</p>}
                            </div>
                            {c.chamber && (
                              <span className="text-[9px] text-muted-foreground/60 shrink-0">{c.chamber}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Research links */}
          <div>
            <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-semibold mb-1.5">Research their stated positions</p>
            <div className="space-y-1">
              {[
                { label: "On The Issues",  url: `https://www.ontheissues.org/search.htm?q=${encodeURIComponent(displayName)}`,                    note: "Quoted positions on every issue" },
                { label: "Ballotpedia",    url: bpUrl,                                                                                              note: "Policy positions & biography" },
                { label: "VoteSmart",      url: vsUrl,                                                                                              note: "Issue positions & interest group ratings" },
                { label: "GovTrack",       url: `https://www.govtrack.us/congress/members?query=${encodeURIComponent(displayName)}`,                note: "Ideology score & legislative activity" },
                { label: "OpenSecrets",    url: `https://www.opensecrets.org/search?type=candidates&q=${encodeURIComponent(displayName)}`,          note: "Who funds them & industry breakdown" },
                { label: "Congress.gov",   url: cgUrl,                                                                                              note: "Official bills & committee work" },
              ].map(link => (
                <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-md border bg-background hover:bg-secondary/50 transition-colors">
                  <div>
                    <p className="text-[11px] font-medium text-primary">{link.label}</p>
                    <p className="text-[9px] text-muted-foreground">{link.note}</p>
                  </div>
                  <ExternalLink size={10} className="text-muted-foreground shrink-0" />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Gov. Spending tab ── */}
      {tab === "gov" && (
        <CandidateGovernmentSpending
          stateCode={stateCode}
          isSenate={isSenate}
          district={district}
        />
      )}
    </div>
  );
}

// ── Contests + candidates for one election ─────────────────────────────────────

function ElectionCandidates({ electionId, stateCode }: { electionId: string; stateCode: string }) {
  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: ["election-candidates", electionId, stateCode],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/politics/elections/candidates?electionId=${encodeURIComponent(electionId)}&state=${encodeURIComponent(stateCode)}`
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${r.status}`);
      }
      return r.json();
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  if (isLoading) return (
    <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
      <Loader2 size={12} className="animate-spin" />Loading candidates…
    </div>
  );
  if (isError) return (
    <p className="px-4 py-2 text-[11px] text-muted-foreground italic">
      {(error as any)?.message ?? "Could not load candidates for this election."}
    </p>
  );

  const contests: any[] = data?.contests ?? [];
  const isFecSource = data?.source === "fec";

  if (contests.length === 0) return (
    <p className="px-4 py-3 text-[11px] text-muted-foreground italic border-t">
      Candidate data isn't available yet for this election — check back closer to the election date.
    </p>
  );

  return (
    <div className="border-t">
      {isFecSource && (
        <div className="px-4 py-2 bg-amber-500/10 border-b">
          <p className="text-[10px] text-amber-600 dark:text-amber-400">
            Ballot-specific candidates not yet available — showing federal candidates who have filed with the FEC for this state.
          </p>
        </div>
      )}
      <div className="divide-y">
        {contests.map((c: any, ci: number) => (
          <div key={ci} className="px-4 py-2.5 space-y-2">
            <div>
              <p className="text-[11px] font-semibold">{c.office}</p>
              {c.district && <p className="text-[10px] text-muted-foreground">{c.district}</p>}
            </div>
            <div className="space-y-2">
              {(c.candidates ?? []).map((k: any, ki: number) => {
                const key = `${ci}-${ki}-${k.name}`;
                const isOpen = expandedCandidate === key;
                return (
                  <div key={ki} className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        className="flex items-center gap-1.5 text-left hover:opacity-80 transition-opacity"
                        onClick={() => setExpandedCandidate(isOpen ? null : key)}
                      >
                        {isOpen ? <ChevronUp size={11} className="text-muted-foreground shrink-0" /> : <ChevronDown size={11} className="text-muted-foreground shrink-0" />}
                        <span className="text-[11px] font-medium">{k.name}</span>
                      </button>
                      {k.party && (
                        <Badge className={`text-[10px] ${PARTY_COLORS[k.party] ?? "bg-secondary text-muted-foreground"}`}>
                          {k.party}
                        </Badge>
                      )}
                      <div className="flex gap-2 ml-auto">
                        {k.url && (
                          <a href={k.url} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                            <Globe size={10} />{isFecSource ? "FEC" : "Website"}
                          </a>
                        )}
                        {k.phone && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Phone size={10} />{k.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <CandidateDetails
                        candidate={k}
                        office={c.office}
                        stateCode={stateCode}
                        isFecSource={isFecSource}
                        district={c.district}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UpcomingElectionsPanel() {
  const [state, setState] = useState("TX");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: elections = [], isLoading, isError } = useQuery<any[]>({
    queryKey: ["upcoming-elections", state],
    queryFn: async () => {
      const qs = state ? `?state=${encodeURIComponent(state)}` : "";
      const r = await apiRequest("GET", `/api/politics/elections/upcoming${qs}`);
      if (!r.ok) throw new Error(`Error ${r.status}`);
      return r.json();
    },
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // Group by month
  const byMonth: Record<string, any[]> = {};
  for (const e of elections) {
    const key = e.date ? format(new Date(e.date + "T12:00:00"), "MMMM yyyy") : "Unknown";
    (byMonth[key] ??= []).push(e);
  }

  function stateFromOcd(ocdId: string | null) {
    if (!ocdId) return state || "TX";
    const m = ocdId.match(/\/state:([a-z]+)/);
    return m ? m[1].toUpperCase() : (state || "TX");
  }

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Vote size={14} className="text-primary" />
          <h3 className="font-semibold text-sm">Upcoming Elections</h3>
          <span className="text-[10px] text-muted-foreground">through 2028 · federal always shown</span>
        </div>
        <select
          value={state}
          onChange={e => { setState(e.target.value); setExpandedId(null); }}
          className="text-xs border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All States</option>
          {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 size={13} className="animate-spin" />Loading elections…
        </div>
      )}
      {isError && (
        <p className="text-xs text-destructive px-4 py-3">Could not load elections. Check GOOGLE_CIVIC_API_KEY.</p>
      )}
      {!isLoading && !isError && elections.length === 0 && (
        <p className="text-xs text-muted-foreground px-4 py-6 text-center">No elections found for the selected state in the next 12 months.</p>
      )}
      {!isLoading && !isError && Object.keys(byMonth).length > 0 && (
        <div className="divide-y">
          {Object.entries(byMonth).map(([month, group]) => (
            <div key={month}>
              <div className="px-4 py-1.5 bg-secondary/40">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{month}</span>
              </div>
              <div className="divide-y">
                {group.map((e: any) => {
                  const isOpen = expandedId === e.id;
                  const isFederal = e.federal || e.ocdId === "ocd-division/country:us";
                  const sc = isFederal ? (state || "TX") : stateFromOcd(e.ocdId);
                  const isHardcoded = (e.id as string).startsWith("fed-");
                  return (
                    <div key={e.id}>
                      <button
                        className="w-full flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-secondary/30 transition-colors text-left"
                        onClick={() => !isHardcoded && setExpandedId(isOpen ? null : e.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[12px] font-medium leading-tight">{e.name}</p>
                            {isFederal && (
                              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[9px]">Federal</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {e.date ? format(new Date(e.date + "T12:00:00"), "MMM d, yyyy") : ""}
                          </p>
                          {e.description && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 italic">{e.description}</p>
                          )}
                        </div>
                        {!isHardcoded && (
                          <div className="flex items-center gap-2 shrink-0 mt-0.5">
                            {isOpen
                              ? <ChevronUp size={13} className="text-muted-foreground" />
                              : <ChevronDown size={13} className="text-muted-foreground" />}
                          </div>
                        )}
                      </button>
                      {isOpen && !isHardcoded && <ElectionCandidates electionId={e.id} stateCode={sc} />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CivicElectionsLookup() {
  const [address, setAddress]       = useState("");
  const [submitted, setSubmitted]   = useState("");
  const [openSection, setOpenSection] = useState<string | null>("polling");

  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: ["civic-elections", submitted],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/politics/elections/civic?address=${encodeURIComponent(submitted)}`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${r.status}`);
      }
      return r.json();
    },
    enabled: !!submitted,
    staleTime: 15 * 60 * 1000,
    retry: false,
  });

  function lookup() {
    if (address.trim()) setSubmitted(address.trim());
  }

  const vi = data?.voterInfo;

  function Section({ id, label, count, children }: { id: string; label: string; count: number; children: React.ReactNode }) {
    if (count === 0) return null;
    const open = openSection === id;
    return (
      <div className="border rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2.5 bg-card hover:bg-secondary/50 transition-colors"
          onClick={() => setOpenSection(open ? null : id)}
        >
          <span className="text-xs font-semibold">{label}</span>
          <div className="flex items-center gap-2">
            <Badge className="bg-secondary text-muted-foreground">{count}</Badge>
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
        </button>
        {open && <div className="px-3 pb-3 pt-1 space-y-2 border-t bg-card">{children}</div>}
      </div>
    );
  }

  return (
    <div className="border rounded-xl bg-secondary/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MapPin size={15} className="text-primary shrink-0" />
        <h3 className="font-semibold text-sm">My Elections & Ballot</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">via Google Civic</span>
      </div>

      {/* Address input */}
      <div className="flex gap-2">
        <input
          value={address}
          onChange={e => setAddress(e.target.value)}
          onKeyDown={e => e.key === "Enter" && lookup()}
          placeholder="Enter your registered address (e.g. 123 Main St, Austin TX 78701)"
          className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <Button size="sm" onClick={lookup} disabled={isLoading || !address.trim()} className="gap-1.5 shrink-0">
          {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {isLoading ? "Looking up…" : "Look up"}
        </Button>
      </div>

      {isError && (
        <p className="text-xs text-destructive">{(error as any)?.message ?? "Could not load election data."}</p>
      )}

      {data && (
        <div className="space-y-2">
          {/* Active election banner */}
          {vi?.election && (
            <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
              <p className="text-xs font-semibold text-primary">{vi.election.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {vi.election.date ? format(new Date(vi.election.date + "T12:00:00"), "MMMM d, yyyy") : ""}
              </p>
            </div>
          )}

          {/* Key Dates */}
          {vi && (vi.election?.date || vi.earlyVotingWindow) && (
            <div className="border rounded-xl overflow-hidden">
              <div className="px-3 py-2.5 bg-card border-b">
                <span className="text-xs font-semibold">Key Dates</span>
              </div>
              <div className="bg-card divide-y">
                {vi.earlyVotingWindow?.start && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[11px] text-muted-foreground">Early Voting Begins</span>
                    <span className="text-[11px] font-medium">
                      {format(new Date(vi.earlyVotingWindow.start + "T12:00:00"), "EEEE, MMMM d, yyyy")}
                    </span>
                  </div>
                )}
                {vi.earlyVotingWindow?.end && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[11px] text-muted-foreground">Last Day of Early Voting</span>
                    <span className="text-[11px] font-medium">
                      {format(new Date(vi.earlyVotingWindow.end + "T12:00:00"), "EEEE, MMMM d, yyyy")}
                    </span>
                  </div>
                )}
                {vi.election?.date && (
                  <div className="flex items-center justify-between px-3 py-2 bg-primary/5">
                    <span className="text-[11px] font-semibold text-primary">Election Day</span>
                    <span className="text-[11px] font-bold text-primary">
                      {format(new Date(vi.election.date + "T12:00:00"), "EEEE, MMMM d, yyyy")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Resources */}
          {vi?.adminLinks && Object.values(vi.adminLinks).some(v => v && typeof v === "string") && (
            <div className="border rounded-xl overflow-hidden">
              <div className="px-3 py-2.5 bg-card border-b">
                <span className="text-xs font-semibold">Voter Resources</span>
              </div>
              <div className="bg-card px-3 py-2 flex flex-wrap gap-x-4 gap-y-1.5">
                {vi.adminLinks.registrationUrl && (
                  <a href={vi.adminLinks.registrationUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink size={10} />Register to Vote
                  </a>
                )}
                {vi.adminLinks.registrationConfirmationUrl && (
                  <a href={vi.adminLinks.registrationConfirmationUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink size={10} />Check Registration
                  </a>
                )}
                {vi.adminLinks.absenteeUrl && (
                  <a href={vi.adminLinks.absenteeUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink size={10} />Mail / Absentee Ballot
                  </a>
                )}
                {vi.adminLinks.ballotInfoUrl && (
                  <a href={vi.adminLinks.ballotInfoUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink size={10} />Sample Ballot
                  </a>
                )}
                {vi.adminLinks.electionInfoUrl && (
                  <a href={vi.adminLinks.electionInfoUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink size={10} />Election Calendar
                  </a>
                )}
                {vi.adminLinks.electionRulesUrl && (
                  <a href={vi.adminLinks.electionRulesUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink size={10} />Voting Rules
                  </a>
                )}
              </div>
              {vi.adminLinks.voterServices?.length > 0 && (
                <div className="px-3 pb-2.5 pt-0 border-t">
                  <ul className="space-y-0.5 mt-1.5">
                    {vi.adminLinks.voterServices.map((s: string, i: number) => (
                      <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                        <span className="mt-0.5 shrink-0 w-1 h-1 rounded-full bg-muted-foreground/40 inline-block" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Polling location */}
          {vi?.pollingLocations?.length > 0 && (
            <Section id="polling" label="Polling Location" count={vi.pollingLocations.length}>
              <div className="space-y-2">
                {vi.pollingLocations.map((l: any, i: number) => <LocationCard key={i} loc={l} />)}
              </div>
            </Section>
          )}

          {/* Early voting */}
          {vi?.earlyVoteSites?.length > 0 && (
            <Section id="early" label="Early Voting Sites" count={vi.earlyVoteSites.length}>
              <div className="space-y-2">
                {vi.earlyVoteSites.map((l: any, i: number) => <LocationCard key={i} loc={l} />)}
              </div>
            </Section>
          )}

          {/* Drop boxes */}
          {vi?.dropOffLocations?.length > 0 && (
            <Section id="dropoff" label="Ballot Drop-Off Locations" count={vi.dropOffLocations.length}>
              <div className="space-y-2">
                {vi.dropOffLocations.map((l: any, i: number) => <LocationCard key={i} loc={l} />)}
              </div>
            </Section>
          )}

          {/* Contests */}
          {vi?.contests?.length > 0 && (
            <Section id="contests" label="Contests on Your Ballot" count={vi.contests.length}>
              <div className="space-y-3">
                {vi.contests.map((c: any, i: number) => (
                  <div key={i} className="space-y-1.5 pb-2 border-b last:border-0">
                    <div>
                      <p className="text-[11px] font-semibold">{c.office}</p>
                      {c.district && <p className="text-[10px] text-muted-foreground">{c.district}</p>}
                    </div>
                    <div className="space-y-1">
                      {c.candidates?.map((k: any, j: number) => (
                        <div key={j} className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-medium">{k.name}</span>
                          {k.party && (
                            <Badge className={PARTY_COLORS[k.party] ?? "bg-secondary text-muted-foreground text-[10px]"}>
                              {k.party}
                            </Badge>
                          )}
                          <div className="flex gap-2 ml-auto">
                            {k.url && (
                              <a href={k.url} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                                <Globe size={10} />Website
                              </a>
                            )}
                            {k.phone && (
                              <a href={`tel:${k.phone}`} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                                <Phone size={10} />{k.phone}
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {vi && !vi.election && vi.contests?.length === 0 && vi.pollingLocations?.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No active election data found for this address right now.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  { id: "officials", label: "Representatives",  icon: Users    },
  { id: "identity",  label: "Political Identity", icon: Compass },
  { id: "issues",    label: "Issues",            icon: BookOpen },
  { id: "elections", label: "Elections",         icon: Vote     },
  { id: "civic",     label: "Civic Actions",     icon: Zap      },
  { id: "news",      label: "News Sources",      icon: Newspaper},
];

// ── Officials Tab ──────────────────────────────────────────────────────────────

function OfficialsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: officials = [] } = useQuery<PoliticalOfficial[]>({
    queryKey: ["/api/politics/officials"],
    queryFn: () => apiRequest("GET", "/api/politics/officials").then(r => r.json()),
  });

  const [form, setForm] = useState<Partial<PoliticalOfficial>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/politics/officials", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/officials"] }); setShowForm(false); setForm({}); toast({ title: "Official added" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/politics/officials/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/officials"] }); setEditing(null); setForm({}); toast({ title: "Updated" }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/politics/officials/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/officials"] }),
  });

  function openEdit(o: PoliticalOfficial) { setEditing(o.id); setForm(o); setShowForm(true); }
  function cancel() { setEditing(null); setForm({}); setShowForm(false); }
  function submit() {
    if (!form.name?.trim()) return;
    if (editing) updateMut.mutate({ id: editing, data: form });
    else createMut.mutate(form);
  }

  async function addFromCongress(member: CongressMember): Promise<void> {
    return new Promise((resolve, reject) => {
      createMut.mutate(
        {
          name: member.name,
          title: member.title,
          level: "federal",
          party: member.party,
          district: member.district ?? undefined,
          stateCode: member.state ?? undefined,
          // Only store real Congress.gov bioguideIds — WIMR results use fake "wimr-N-Name" IDs
          externalId: member.bioguideId.startsWith("wimr-") ? undefined : member.bioguideId,
          phone: member.phone ?? undefined,
          website: member.website ?? undefined,
          notes: member.office ? `Office: ${member.office}` : undefined,
        },
        { onSuccess: () => resolve(), onError: (e) => reject(e) }
      );
    });
  }

  const grouped = LEVELS.reduce((acc, level) => {
    acc[level] = officials.filter(o => (o.level ?? "").toLowerCase() === level.toLowerCase());
    return acc;
  }, {} as Record<string, PoliticalOfficial[]>);
  const ungrouped = officials.filter(o => !o.level || !LEVELS.map(l => l.toLowerCase()).includes(o.level.toLowerCase()));

  // Sub-group a list of officials by stateCode, sorted alphabetically
  function byState(list: PoliticalOfficial[]): { stateLabel: string; officials: PoliticalOfficial[] }[] {
    const stateMap = new Map<string, PoliticalOfficial[]>();
    for (const o of list) {
      const key = o.stateCode?.toUpperCase() ?? "";
      if (!stateMap.has(key)) stateMap.set(key, []);
      stateMap.get(key)!.push(o);
    }
    return [...stateMap.entries()]
      .sort(([a], [b]) => {
        // Empty (no state) goes last
        if (!a && b) return 1;
        if (a && !b) return -1;
        const nameA = US_STATES.find(s => s.code === a)?.name ?? a;
        const nameB = US_STATES.find(s => s.code === b)?.name ?? b;
        return nameA.localeCompare(nameB);
      })
      .map(([code, officials]) => ({
        stateLabel: code ? (US_STATES.find(s => s.code === code)?.name ?? code) : "",
        officials,
      }));
  }

  return (
    <div className="space-y-4">
      {/* Congress.gov search */}
      <CongressSearch existingOfficials={officials} onAdd={addFromCongress} />

      {!showForm ? (
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="gap-1.5"><Plus size={14} />Add Manually</Button>
      ) : (
        <div className="border rounded-xl p-4 bg-secondary/30 space-y-3">
          <h3 className="font-medium text-sm">{editing ? "Edit Official" : "Add Official"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *">
              <Input value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Jane Smith" />
            </Field>
            <Field label="Title">
              <Input value={form.title ?? ""} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. U.S. Senator" />
            </Field>
            <Field label="Level">
              <Select value={form.level ?? ""} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
                <option value="">Select level…</option>
                {LEVELS.map(l => <option key={l} value={l.toLowerCase()}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Party">
              <Select value={form.party ?? ""} onChange={e => setForm(f => ({ ...f, party: e.target.value }))}>
                <option value="">Select party…</option>
                {PARTIES.map(p => <option key={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label="District">
              <Input value={form.district ?? ""} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} placeholder="e.g. TX-7" />
            </Field>
            {(form.level === "state") && (
              <Field label="State">
                <Select value={form.stateCode ?? ""} onChange={e => setForm(f => ({ ...f, stateCode: e.target.value }))}>
                  <option value="">Select state…</option>
                  {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Term Ends">
              <Input type="date" value={form.termEnd ?? ""} onChange={e => setForm(f => ({ ...f, termEnd: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone ?? ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(202) 555-0100" />
            </Field>
            <Field label="Email">
              <Input value={form.email ?? ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@senate.gov" />
            </Field>
            <Field label="Website">
              <Input value={form.website ?? ""} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://…" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes ?? ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Key positions, voting record, notes…" />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={submit}><Check size={13} className="mr-1" />{editing ? "Save" : "Add"}</Button>
            <Button size="sm" variant="ghost" onClick={cancel}><X size={13} /></Button>
          </div>
        </div>
      )}

      {officials.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-8">No representatives added yet. Track your elected officials at every level.</p>
      )}

      {[...LEVELS, "Other"].map(level => {
        const group = level === "Other" ? ungrouped : grouped[level] ?? [];
        if (group.length === 0) return null;
        const stateGroups = byState(group);
        return (
          <div key={level}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{level}</h3>
            <div className="space-y-4">
              {stateGroups.map(({ stateLabel, officials: stateOfficials }) => (
                <div key={stateLabel || "__none__"}>
                  {stateLabel && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wide">{stateLabel}</span>
                      <div className="flex-1 h-px bg-border/50" />
                    </div>
                  )}
                  <div className="space-y-2">
                    {stateOfficials.map(o => (
                      <div key={o.id} className="border rounded-xl bg-card">
                        <div
                          className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                          onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{o.name}</span>
                              {o.title && <span className="text-xs text-muted-foreground">{o.title}</span>}
                              {o.party && <Badge className={PARTY_COLORS[o.party] ?? "bg-secondary text-muted-foreground"}>{o.party}</Badge>}
                              {o.district && <Badge className="bg-secondary text-muted-foreground">{o.district}</Badge>}
                            </div>
                            {o.termEnd && (
                              <p className="text-xs text-muted-foreground mt-0.5">Term ends {format(parseISO(o.termEnd), "MMM yyyy")}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={e => { e.stopPropagation(); openEdit(o); }} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><Pencil size={13} /></button>
                            <button onClick={e => { e.stopPropagation(); deleteMut.mutate(o.id); }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={13} /></button>
                            {expandedId === o.id ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                          </div>
                        </div>
                        {expandedId === o.id && (
                          <div className="px-4 pb-4 border-t pt-3 space-y-2 text-sm">
                            {o.phone && (
                              <a href={`tel:${o.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                                <Phone size={13} />{o.phone}
                              </a>
                            )}
                            {o.email && (
                              <a href={`mailto:${o.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                                <Mail size={13} />{o.email}
                              </a>
                            )}
                            {o.website && (
                              <a href={o.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:underline transition-colors">
                                <Globe size={13} />Official website <ExternalLink size={11} />
                              </a>
                            )}
                            {o.notes && <p className="text-muted-foreground text-xs mt-2 whitespace-pre-wrap">{o.notes}</p>}
                            <VotingRecords official={o} />
                            <CampaignFinance official={o} />
                            <CampaignSpending official={o} />
                            <GovernmentSpending official={o} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Issues Tab ─────────────────────────────────────────────────────────────────

function PositionPicker({ value, onChange, supportStance, opposeStance }: {
  value: string;
  onChange: (v: string) => void;
  supportStance?: string;
  opposeStance?: string;
}) {
  const meta  = POSITION_META[value];
  const score = meta?.score ?? 0;
  const showStance = supportStance || opposeStance;
  const stanceText = !meta || value === "neutral"
    ? null
    : score > 0
      ? supportStance
      : opposeStance;
  const stanceColor = score > 0 ? "text-emerald-600 dark:text-emerald-400" : score < 0 ? "text-red-500 dark:text-red-400" : "text-muted-foreground";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {POSITIONS.filter(p => !["undecided"].includes(p)).map(p => {
          const m = POSITION_META[p];
          const active = value === p;
          return (
            <button key={p} onClick={() => onChange(p)}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-all ${
                active ? `${m.badge} border-transparent shadow-sm` : "bg-transparent border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}>
              {m.label}
            </button>
          );
        })}
      </div>
      {showStance && stanceText && (
        <p className={`text-[11px] font-medium flex items-start gap-1 ${stanceColor}`}>
          <span className="shrink-0 mt-px">{score > 0 ? "✓" : "✗"}</span>
          <span>{stanceText}</span>
        </p>
      )}
      {showStance && value === "neutral" && (
        <p className="text-[11px] text-muted-foreground">— You're neutral on this issue</p>
      )}
    </div>
  );
}

function PositionBar({ position }: { position: string }) {
  const meta = POSITION_META[position];
  if (!meta) return null;
  const score = meta.score; // -3 to 3
  const pct   = ((score + 3) / 6) * 100; // 0-100%
  return (
    <div className="relative h-1.5 rounded-full bg-secondary overflow-hidden">
      <div className="absolute inset-y-0 left-1/2 w-px bg-border/60 z-10" />
      <div className={`absolute inset-y-0 ${meta.bar} transition-all`}
        style={score >= 0
          ? { left: "50%", width: `${pct - 50}%` }
          : { left: `${pct}%`, width: `${50 - pct}%` }}
      />
    </div>
  );
}

function IssuesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: issues = [] } = useQuery<PoliticalIssue[]>({
    queryKey: ["/api/politics/issues"],
    queryFn: () => apiRequest("GET", "/api/politics/issues").then(r => r.json()),
  });

  const [view, setView]         = useState<"my" | "browse">("my");
  const [browsecat, setBrowsecat] = useState(ISSUE_LIBRARY[0].category);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterCat, setFilterCat] = useState("All");
  const [addingTopic, setAddingTopic] = useState<string | null>(null); // topic being quick-added
  const [addPos, setAddPos]     = useState("neutral");
  const [addImportance, setAddImportance] = useState(3);
  const [addNotes, setAddNotes] = useState("");
  const [customForm, setCustomForm] = useState(false);
  const [cForm, setCForm]       = useState<Partial<PoliticalIssue>>({ importance: 3, position: "neutral" });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/politics/issues", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/issues"] }); setAddingTopic(null); setAddPos("neutral"); setAddNotes(""); setCustomForm(false); setCForm({ importance: 3, position: "neutral" }); toast({ title: "Issue added" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/politics/issues/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/issues"] }); setEditingId(null); toast({ title: "Updated" }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/politics/issues/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/issues"] }),
  });

  // Exclude Political Identity items (those live in the dedicated IdentityTab)
  const regularIssues = issues.filter(i => i.category !== "Political Identity");

  const issueMap = new Map(regularIssues.map(i => [i.topic?.toLowerCase().trim(), i]));
  const categoriesWithIssues = ISSUE_LIBRARY.map(g => g.category).filter(cat =>
    regularIssues.some(i => i.category === cat)
  );
  const allCategories = ["All", ...categoriesWithIssues, ...(regularIssues.some(i => !ISSUE_LIBRARY.find(g => g.category === i.category)) ? ["Other"] : [])];
  const filtered = filterCat === "All" ? regularIssues : regularIssues.filter(i => i.category === filterCat);

  function quickAdd(topic: string, category: string) {
    setAddingTopic(topic); setAddPos("neutral"); setAddImportance(3); setAddNotes("");
    const libCat = ISSUE_LIBRARY.find(g => g.issues.some(i => i.topic === topic))?.category ?? category;
    setCForm(f => ({ ...f, topic, category: libCat }));
  }
  function confirmQuickAdd() {
    createMut.mutate({ topic: cForm.topic, category: cForm.category, position: addPos, importance: addImportance, notes: addNotes });
  }

  const browseCatIssues = ISSUE_LIBRARY.find(g => g.category === browsecat)?.issues ?? [];

  return (
    <div className="space-y-4">
      {/* ── Tab switcher ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setView("my")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === "my" ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80 text-muted-foreground"}`}>
          📋 My Positions ({regularIssues.length})
        </button>
        <button onClick={() => setView("browse")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === "browse" ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80 text-muted-foreground"}`}>
          🔍 Browse Issues
        </button>
        <button onClick={() => { setCustomForm(c => !c); setView("my"); }}
          className="ml-auto px-3 py-1.5 rounded-lg text-sm font-medium bg-secondary hover:bg-secondary/80 text-muted-foreground flex items-center gap-1.5">
          <Plus size={13} />Custom Issue
        </button>
      </div>

      {/* ── Custom issue form ── */}
      {customForm && (
        <div className="border rounded-xl p-4 bg-secondary/20 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add custom issue</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Topic *">
              <Input value={cForm.topic ?? ""} onChange={e => setCForm(f => ({ ...f, topic: e.target.value }))} placeholder="e.g. Universal Basic Income" />
            </Field>
            <Field label="Category">
              <Select value={cForm.category ?? ""} onChange={e => setCForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">Select…</option>
                {ISSUE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="My Position"><PositionPicker value={cForm.position ?? "neutral"} onChange={v => setCForm(f => ({ ...f, position: v }))} /></Field>
          <div className="flex items-center gap-3">
            <Field label="Importance (1–5)">
              <StarRating value={cForm.importance ?? 3} onChange={v => setCForm(f => ({ ...f, importance: v }))} />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={cForm.notes ?? ""} onChange={e => setCForm(f => ({ ...f, notes: e.target.value }))} placeholder="Your reasoning, nuance, context…" rows={2} />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { if (!cForm.topic?.trim()) return; createMut.mutate(cForm); }}><Check size={13} className="mr-1" />Add</Button>
            <Button size="sm" variant="ghost" onClick={() => setCustomForm(false)}><X size={13} /></Button>
          </div>
        </div>
      )}

      {/* ══ MY POSITIONS view ══ */}
      {view === "my" && (
        <div className="space-y-3">
          {regularIssues.length === 0 && (
            <div className="text-center py-10 space-y-3">
              <p className="text-muted-foreground text-sm">No positions tracked yet.</p>
              <Button size="sm" onClick={() => setView("browse")} className="gap-1.5"><Search size={13} />Browse Issues to Add</Button>
            </div>
          )}

          {regularIssues.length > 0 && (
            <>
              {/* Summary bar */}
              <div className="rounded-xl border bg-secondary/20 px-4 py-3 flex items-center gap-6 flex-wrap">
                <div className="text-center">
                  <div className="text-xl font-bold">{regularIssues.length}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Issues tracked</div>
                </div>
                {(["strongly_support","support","lean_support"] as const).map(p => {
                  const count = regularIssues.filter(i => i.position === p).length;
                  return count > 0 ? (
                    <div key={p} className="text-center">
                      <div className={`text-lg font-bold ${POSITION_META[p].badge.includes("emerald") || POSITION_META[p].badge.includes("teal") ? "text-emerald-500" : "text-teal-500"}`}>{count}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{POSITION_META[p].short}</div>
                    </div>
                  ) : null;
                })}
                {(["lean_oppose","oppose","strongly_oppose"] as const).map(p => {
                  const count = regularIssues.filter(i => i.position === p).length;
                  return count > 0 ? (
                    <div key={p} className="text-center">
                      <div className="text-lg font-bold text-red-500">{count}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{POSITION_META[p].short}</div>
                    </div>
                  ) : null;
                })}
                <div className="text-center">
                  <div className="text-lg font-bold text-stone-400">{regularIssues.filter(i => !i.position || i.position === "neutral" || i.position === "undecided").length}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Neutral/TBD</div>
                </div>
              </div>

              {/* Category filter */}
              {allCategories.length > 2 && (
                <div className="flex flex-wrap gap-1.5">
                  {allCategories.map(c => (
                    <button key={c} onClick={() => setFilterCat(c)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterCat === c ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80 text-muted-foreground"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              )}

              {/* Issue cards grouped by category */}
              {(() => {
                const cats = filterCat === "All"
                  ? Array.from(new Set(filtered.map(i => i.category ?? "Other")))
                  : [filterCat];
                return cats.map(cat => {
                  const catIssues = filtered.filter(i => (i.category ?? "Other") === cat);
                  if (!catIssues.length) return null;
                  const emoji = ISSUE_LIBRARY.find(g => g.category === cat)?.emoji ?? "📌";
                  return (
                    <div key={cat} className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <span>{emoji}</span>{cat}
                      </p>
                      {catIssues.map(issue => {
                        const meta    = POSITION_META[issue.position ?? "neutral"] ?? POSITION_META.neutral;
                        const isEditing = editingId === issue.id;
                        const isExpanded = expandedId === issue.id;
                        const libEntry = ISSUE_LIBRARY.flatMap(g => g.issues).find(i => i.topic === issue.topic);
                        return (
                          <div key={issue.id} className="border rounded-xl bg-card overflow-hidden">
                            <div className="px-3.5 py-2.5 flex items-center gap-3 cursor-pointer"
                              onClick={() => setExpandedId(isExpanded ? null : issue.id)}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{issue.topic}</span>
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${meta.badge}`}>{meta.short}</span>
                                  {issue.importance != null && (
                                    <div className="flex gap-0.5 ml-1">
                                      {Array.from({ length: 5 }).map((_, i) => (
                                        <Star key={i} size={9} className={i < issue.importance! ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"} />
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="mt-1.5"><PositionBar position={issue.position ?? "neutral"} /></div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={e => { e.stopPropagation(); setEditingId(isEditing ? null : issue.id); setExpandedId(issue.id); }}
                                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><Pencil size={12} /></button>
                                <button onClick={e => { e.stopPropagation(); deleteMut.mutate(issue.id); }}
                                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={12} /></button>
                                {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="border-t px-3.5 py-3 space-y-3 bg-secondary/10">
                                {isEditing ? (
                                  <>
                                    <Field label="My Position">
                                      <PositionPicker value={issue.position ?? "neutral"} onChange={v => updateMut.mutate({ id: issue.id, data: { position: v } })} supportStance={libEntry?.supportStance} opposeStance={libEntry?.opposeStance} />
                                    </Field>
                                    <div className="flex items-center gap-4">
                                      <Field label="Importance">
                                        <StarRating value={issue.importance ?? 3} onChange={v => updateMut.mutate({ id: issue.id, data: { importance: v } })} />
                                      </Field>
                                    </div>
                                    <Field label="Notes">
                                      <IssueNotesEditor issue={issue} onSave={notes => { updateMut.mutate({ id: issue.id, data: { notes } }); setEditingId(null); }} />
                                    </Field>
                                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X size={12} className="mr-1" />Done</Button>
                                  </>
                                ) : (
                                  <>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] text-red-400 font-medium shrink-0">Oppose</span>
                                        <div className="flex-1"><PositionBar position={issue.position ?? "neutral"} /></div>
                                        <span className="text-[9px] text-emerald-400 font-medium shrink-0">Support</span>
                                      </div>
                                      {(() => {
                                        const score = meta.score;
                                        const stanceText = score > 0 ? libEntry?.supportStance : score < 0 ? libEntry?.opposeStance : null;
                                        const stanceColor = score > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
                                        return stanceText ? (
                                          <p className={`text-[11px] font-medium mt-1.5 flex items-start gap-1 ${stanceColor}`}>
                                            <span className="shrink-0">{score > 0 ? "✓" : "✗"}</span>
                                            <span>{stanceText}</span>
                                          </p>
                                        ) : (
                                          <p className="text-[11px] text-center mt-1 font-medium text-muted-foreground">{meta.label}</p>
                                        );
                                      })()}
                                    </div>
                                    {issue.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{issue.notes}</p>}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                });
              })()}
            </>
          )}
        </div>
      )}

      {/* ══ BROWSE view ══ */}
      {view === "browse" && (
        <div className="space-y-3">
          {/* Category pills */}
          <div className="flex flex-wrap gap-1.5">
            {ISSUE_LIBRARY.map(g => (
              <button key={g.category} onClick={() => setBrowsecat(g.category)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${browsecat === g.category ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80 text-muted-foreground"}`}>
                {g.emoji} {g.category}
              </button>
            ))}
          </div>

          {/* Issues grid */}
          <div className="space-y-2">
            {browseCatIssues.map(lib => {
              const existing = issueMap.get(lib.topic.toLowerCase().trim());
              const isAdding  = addingTopic === lib.topic;
              return (
                <div key={lib.topic} className={`border rounded-xl overflow-hidden transition-colors ${existing ? "bg-secondary/10" : "bg-card"}`}>
                  <div className="px-3.5 py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{lib.topic}</span>
                        {existing && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${(POSITION_META[existing.position ?? "neutral"] ?? POSITION_META.neutral).badge}`}>
                            {(POSITION_META[existing.position ?? "neutral"] ?? POSITION_META.neutral).short}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{lib.description}</p>
                      {existing && <div className="mt-1.5"><PositionBar position={existing.position ?? "neutral"} /></div>}
                    </div>
                    <div className="shrink-0">
                      {existing ? (
                        <button onClick={() => { setView("my"); setExpandedId(existing.id); setEditingId(existing.id); }}
                          className="text-[11px] text-primary hover:underline px-2 py-1">Edit</button>
                      ) : (
                        <button onClick={() => isAdding ? setAddingTopic(null) : quickAdd(lib.topic, browsecat)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${isAdding ? "bg-secondary text-muted-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"}`}>
                          {isAdding ? "Cancel" : "+ Add"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline add panel */}
                  {isAdding && (
                    <div className="border-t px-3.5 py-3 bg-secondary/10 space-y-3">
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">My position on {lib.topic}</p>
                        <PositionPicker value={addPos} onChange={setAddPos} supportStance={lib.supportStance} opposeStance={lib.opposeStance} />
                      </div>
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">How much does this affect my vote?</p>
                          <StarRating value={addImportance} onChange={setAddImportance} />
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">Notes (optional)</p>
                        <Textarea value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="Your reasoning or nuance…" rows={2} />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={confirmQuickAdd} disabled={createMut.isPending}>
                          <Check size={13} className="mr-1" />Save Position
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAddingTopic(null)}><X size={13} /></Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Political Identity Tab ──────────────────────────────────────────────────────

function IdentityTab() {
  const qc = useQueryClient();
  const { data: issues = [] } = useQuery<PoliticalIssue[]>({
    queryKey: ["/api/politics/issues"],
    queryFn: () => apiRequest("GET", "/api/politics/issues").then(r => r.json()),
  });
  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/politics/issues", data).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/issues"] }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/politics/issues/${id}`, data).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/issues"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/politics/issues/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/issues"] }),
  });

  const identityIssues = issues.filter(i => i.category === "Political Identity");
  const axisIssues     = identityIssues.filter(i => IDEOLOGY_AXES.some(a => a.topic === i.topic));
  const ideologyIssues = identityIssues.filter(i => !IDEOLOGY_AXES.some(a => a.topic === i.topic));
  const ideologyMap    = new Map(ideologyIssues.map(i => [i.topic?.toLowerCase().trim(), i]));

  return (
    <div className="space-y-6">

      {/* ── At-a-Glance Summary ── */}
      {(axisIssues.length > 0 || ideologyIssues.length > 0) && (
        <div className="rounded-xl border bg-secondary/20 p-4 space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Your Political Identity at a Glance</p>
          {axisIssues.length > 0 && (
            <div className="space-y-1.5">
              {axisIssues.map(ax => {
                const axDef  = IDEOLOGY_AXES.find(a => a.topic === ax.topic);
                if (!axDef) return null;
                const stepIdx = AXIS_POSITIONS.indexOf(ax.position as any);
                const step   = stepIdx >= 0 ? axDef.steps[stepIdx] : null;
                const pct    = stepIdx >= 0 ? (stepIdx / 6) * 100 : 50;
                return (
                  <div key={ax.topic} className="flex items-center gap-2">
                    <span className="text-xs shrink-0 w-4 text-center">{axDef.emoji}</span>
                    <span className="text-[10px] text-muted-foreground w-28 shrink-0 truncate">{axDef.topic.replace(" Axis","")}</span>
                    <div className="flex-1 relative h-2 rounded-full bg-gradient-to-r from-blue-400 via-stone-300 to-red-400 overflow-visible">
                      <div className="absolute inset-y-0 left-1/2 w-px bg-white/60 z-10" />
                      <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white bg-primary shadow-sm z-20 transition-all"
                        style={{ left: `calc(${pct}% - 6px)` }} />
                    </div>
                    {step && <span className="text-[10px] font-medium text-foreground w-24 shrink-0 text-right">{step.label}</span>}
                  </div>
                );
              })}
            </div>
          )}
          {ideologyIssues.filter(i => i.position === "strongly_support" || i.position === "support").length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">Identifies with:</p>
              <div className="flex flex-wrap gap-1.5">
                {ideologyIssues
                  .filter(i => i.position === "strongly_support" || i.position === "support")
                  .map(i => {
                    const meta = IDEOLOGY_IDENTIFICATION_META[i.position ?? "neutral"];
                    return <span key={i.topic} className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>{i.topic}</span>;
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Political Compass Axes ── */}
      <div className="space-y-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Political Compass — Where Do You Stand?</p>
        {IDEOLOGY_AXES.map(axis => {
          const saved   = axisIssues.find(i => i.topic === axis.topic);
          const curIdx  = saved ? AXIS_POSITIONS.indexOf(saved.position as any) : -1;
          const curStep = curIdx >= 0 ? axis.steps[curIdx] : null;
          return (
            <div key={axis.topic} className="border rounded-xl bg-card p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span>{axis.emoji}</span>
                  <span className="text-sm font-medium">{axis.topic}</span>
                </div>
                {curStep && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{curStep.label}</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                <span className="shrink-0">{axis.leftLabel}</span>
                <div className="flex-1 flex gap-0.5">
                  {axis.steps.map((step, idx) => {
                    const isActive = curIdx === idx;
                    return (
                      <button key={idx} title={`${step.label}: ${step.desc}`}
                        onClick={() => {
                          const pos = AXIS_POSITIONS[idx];
                          if (saved) {
                            updateMut.mutate({ id: saved.id, data: { position: pos } });
                          } else {
                            createMut.mutate({ topic: axis.topic, category: "Political Identity", position: pos, importance: 1 });
                          }
                        }}
                        className={`flex-1 h-7 rounded transition-all border text-[9px] font-medium leading-tight px-0.5 truncate ${
                          isActive
                            ? "bg-primary text-primary-foreground border-transparent shadow-sm"
                            : "bg-secondary/40 border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                        }`}>
                        <span className="block truncate">{step.label}</span>
                      </button>
                    );
                  })}
                </div>
                <span className="shrink-0">{axis.rightLabel}</span>
              </div>
              {curStep && <p className="text-[11px] text-muted-foreground pl-1">{curStep.desc}</p>}
              {saved && (
                <button onClick={() => deleteMut.mutate(saved.id)}
                  className="text-[10px] text-muted-foreground/50 hover:text-destructive transition-colors">Clear</button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Ideology Identification ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ideology Identification</p>
          <p className="text-[10px] text-muted-foreground">Click a level to mark your relationship</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["strongly_support","support","lean_support","lean_oppose","oppose"] as const).map(p => {
            const meta = IDEOLOGY_IDENTIFICATION_META[p];
            return <span key={p} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>{meta.short}</span>;
          })}
        </div>
        {IDEOLOGY_LIBRARY.map(group => (
          <div key={group.category} className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <span>{group.emoji}</span>{group.category}
            </p>
            {group.ideologies.map(ideo => {
              const existing = ideologyMap.get(ideo.name.toLowerCase().trim());
              const curPos   = existing?.position ?? null;
              const curMeta  = curPos ? IDEOLOGY_IDENTIFICATION_META[curPos] : null;
              return (
                <div key={ideo.name} className={`border rounded-xl overflow-hidden transition-colors ${existing ? "bg-secondary/10" : "bg-card"}`}>
                  <div className="px-3.5 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-medium text-sm">{ideo.name}</span>
                      {curMeta && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${curMeta.badge}`}>{curMeta.short}</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-2">{ideo.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {(["strongly_support","support","lean_support","lean_oppose","oppose"] as const).map(p => {
                        const m = IDEOLOGY_IDENTIFICATION_META[p];
                        const active = curPos === p;
                        return (
                          <button key={p}
                            onClick={() => {
                              if (active) {
                                if (existing) deleteMut.mutate(existing.id);
                              } else if (existing) {
                                updateMut.mutate({ id: existing.id, data: { position: p } });
                              } else {
                                createMut.mutate({ topic: ideo.name, category: "Political Identity", position: p, importance: 1 });
                              }
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                              active
                                ? `${m.badge} border-transparent shadow-sm`
                                : "bg-transparent border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            }`}>
                            {m.short}
                          </button>
                        );
                      })}
                      {existing && (
                        <button onClick={() => deleteMut.mutate(existing.id)}
                          className="px-2 py-0.5 rounded text-[10px] border border-transparent text-muted-foreground/40 hover:text-destructive hover:border-destructive/30 transition-all ml-auto">
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function IssueNotesEditor({ issue, onSave }: { issue: PoliticalIssue; onSave: (notes: string) => void }) {
  const [val, setVal] = useState(issue.notes ?? "");
  return (
    <div className="space-y-2">
      <Textarea value={val} onChange={e => setVal(e.target.value)} placeholder="Your reasoning, nuance, context…" rows={2} />
      {val !== (issue.notes ?? "") && (
        <Button size="sm" onClick={() => onSave(val)}><Check size={12} className="mr-1" />Save notes</Button>
      )}
    </div>
  );
}

// ── Elections Tab ──────────────────────────────────────────────────────────────

function ElectionsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: elections = [] } = useQuery<PoliticalElection[]>({
    queryKey: ["/api/politics/elections"],
    queryFn: () => apiRequest("GET", "/api/politics/elections").then(r => r.json()),
  });

  const [form, setForm] = useState<Partial<PoliticalElection>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/politics/elections", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/elections"] }); setShowForm(false); setForm({}); toast({ title: "Election added" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/politics/elections/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/elections"] }); setEditing(null); setForm({}); toast({ title: "Updated" }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/politics/elections/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/elections"] }),
  });
  const toggleVotedMut = useMutation({
    mutationFn: ({ id, voted }: { id: number; voted: boolean }) => apiRequest("PATCH", `/api/politics/elections/${id}`, { voted }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/elections"] }),
  });

  function openEdit(e: PoliticalElection) { setEditing(e.id); setForm(e); setShowForm(true); }
  function cancel() { setEditing(null); setForm({}); setShowForm(false); }
  function submit() {
    if (!form.name?.trim()) return;
    if (editing) updateMut.mutate({ id: editing, data: form });
    else createMut.mutate(form);
  }

  const today = startOfDay(new Date());
  const upcoming = elections.filter(e => !e.date || isAfter(parseISO(e.date), today));
  const past = elections.filter(e => e.date && isBefore(parseISO(e.date), today));

  function electionStatus(e: PoliticalElection) {
    if (!e.date) return null;
    const d = parseISO(e.date);
    if (isBefore(d, today)) return e.voted ? "voted" : "missed";
    if (isBefore(d, addDays(today, 30))) return "soon";
    return "upcoming";
  }

  const statusMeta: Record<string, { label: string; color: string }> = {
    voted:    { label: "Voted ✓",   color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    missed:   { label: "Missed",    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
    soon:     { label: "Coming up", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    upcoming: { label: "Upcoming",  color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  };

  function ElectionCard({ e }: { e: PoliticalElection }) {
    const status = electionStatus(e);
    return (
      <div className="border rounded-xl bg-card">
        <div className="flex items-start gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
          <button
            onClick={ev => { ev.stopPropagation(); toggleVotedMut.mutate({ id: e.id, voted: !e.voted }); }}
            className="mt-0.5 shrink-0 transition-colors"
          >
            {e.voted
              ? <CheckCircle2 size={18} className="text-emerald-500" />
              : <Circle size={18} className="text-muted-foreground/40 hover:text-muted-foreground" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{e.name}</span>
              {e.level && <Badge className="bg-secondary text-muted-foreground">{e.level}</Badge>}
              {status && <Badge className={statusMeta[status].color}>{statusMeta[status].label}</Badge>}
            </div>
            {e.date && <p className="text-xs text-muted-foreground mt-0.5">{format(parseISO(e.date), "MMMM d, yyyy")}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={ev => { ev.stopPropagation(); openEdit(e); }} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><Pencil size={13} /></button>
            <button onClick={ev => { ev.stopPropagation(); deleteMut.mutate(e.id); }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={13} /></button>
            {expandedId === e.id ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
          </div>
        </div>
        {expandedId === e.id && (
          <div className="px-4 pb-4 border-t pt-3 space-y-1.5 text-sm">
            {e.registrationDeadline && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Calendar size={12} />Registration deadline: {format(parseISO(e.registrationDeadline), "MMM d, yyyy")}</p>
            )}
            {e.pollingLocation && (
              <p className="text-xs text-muted-foreground">📍 {e.pollingLocation}</p>
            )}
            {e.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-2">{e.notes}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <UpcomingElectionsPanel />
      <CivicElectionsLookup />

      {!showForm ? (
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5"><Plus size={14} />Add Election</Button>
      ) : (
        <div className="border rounded-xl p-4 bg-secondary/30 space-y-3">
          <h3 className="font-medium text-sm">{editing ? "Edit Election" : "Add Election"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Election Name *">
              <Input value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. 2026 Midterm Elections" />
            </Field>
            <Field label="Date">
              <Input type="date" value={form.date ?? ""} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </Field>
            <Field label="Level">
              <Select value={form.level ?? ""} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
                <option value="">Select level…</option>
                {ELECTION_LEVELS.map(l => <option key={l}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Registration Deadline">
              <Input type="date" value={form.registrationDeadline ?? ""} onChange={e => setForm(f => ({ ...f, registrationDeadline: e.target.value }))} />
            </Field>
            <Field label="Polling Location" className="col-span-2">
              <Input value={form.pollingLocation ?? ""} onChange={e => setForm(f => ({ ...f, pollingLocation: e.target.value }))} placeholder="Address or polling location name" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes ?? ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Key races, ballot measures, candidates…" />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={submit}><Check size={13} className="mr-1" />{editing ? "Save" : "Add"}</Button>
            <Button size="sm" variant="ghost" onClick={cancel}><X size={13} /></Button>
          </div>
        </div>
      )}

      {elections.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-8">No elections tracked yet. Add upcoming elections and check them off when you've voted.</p>
      )}

      {upcoming.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Upcoming</h3>
          <div className="space-y-2">{upcoming.map(e => <ElectionCard key={e.id} e={e} />)}</div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Past</h3>
          <div className="space-y-2">{past.map(e => <ElectionCard key={e.id} e={e} />)}</div>
        </div>
      )}
    </div>
  );
}

// ── Civic Actions Tab ──────────────────────────────────────────────────────────

function CivicActionsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: actions = [] } = useQuery<CivicAction[]>({
    queryKey: ["/api/politics/civic-actions"],
    queryFn: () => apiRequest("GET", "/api/politics/civic-actions").then(r => r.json()),
  });

  const [form, setForm] = useState<Partial<CivicAction>>({ date: new Date().toISOString().slice(0, 10), type: "voted" });
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/politics/civic-actions", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/civic-actions"] }); setShowForm(false); setForm({ date: new Date().toISOString().slice(0, 10), type: "voted" }); toast({ title: "Action logged" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/politics/civic-actions/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/civic-actions"] }); setEditing(null); setForm({ date: new Date().toISOString().slice(0, 10), type: "voted" }); toast({ title: "Updated" }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/politics/civic-actions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/civic-actions"] }),
  });

  function openEdit(a: CivicAction) { setEditing(a.id); setForm(a); setShowForm(true); }
  function cancel() { setEditing(null); setForm({ date: new Date().toISOString().slice(0, 10), type: "voted" }); setShowForm(false); }
  function submit() {
    if (!form.type || !form.date) return;
    if (editing) updateMut.mutate({ id: editing, data: form });
    else createMut.mutate(form);
  }

  // Stats
  const totalActions = actions.length;
  const typeCounts = ACTION_TYPES.map(t => ({ ...t, count: actions.filter(a => a.type === t.value).length })).filter(t => t.count > 0);

  return (
    <div className="space-y-4">
      {totalActions > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border rounded-xl px-3 py-2.5 bg-card text-center">
            <div className="text-2xl font-bold">{totalActions}</div>
            <div className="text-xs text-muted-foreground">Total Actions</div>
          </div>
          {typeCounts.slice(0, 3).map(t => (
            <div key={t.value} className="border rounded-xl px-3 py-2.5 bg-card text-center">
              <div className="text-2xl font-bold">{t.count}</div>
              <div className="text-xs text-muted-foreground">{t.label}</div>
            </div>
          ))}
        </div>
      )}

      {!showForm ? (
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5"><Plus size={14} />Log Action</Button>
      ) : (
        <div className="border rounded-xl p-4 bg-secondary/30 space-y-3">
          <h3 className="font-medium text-sm">{editing ? "Edit Action" : "Log Civic Action"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type *">
              <Select value={form.type ?? "voted"} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
              </Select>
            </Field>
            <Field label="Date *">
              <Input type="date" value={form.date ?? ""} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </Field>
            <Field label="Description">
              <Input value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What did you do?" />
            </Field>
            <Field label="Official / Organization">
              <Input value={form.official ?? ""} onChange={e => setForm(f => ({ ...f, official: e.target.value }))} placeholder="Rep. Jane Smith, ACLU…" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes ?? ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional details…" />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={submit}><Check size={13} className="mr-1" />{editing ? "Save" : "Log"}</Button>
            <Button size="sm" variant="ghost" onClick={cancel}><X size={13} /></Button>
          </div>
        </div>
      )}

      {actions.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-8">No civic actions logged yet. Start tracking your engagement — voting, calling reps, volunteering, and more.</p>
      )}

      <div className="space-y-2">
        {actions.map(action => {
          const meta = ACTION_TYPES.find(t => t.value === action.type);
          return (
            <div key={action.id} className="border rounded-xl px-4 py-3 bg-card flex items-start gap-3">
              <span className="text-lg leading-none mt-0.5 shrink-0">{meta?.emoji ?? "⚡"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{meta?.label ?? action.type}</span>
                  {action.official && <Badge className="bg-secondary text-muted-foreground">{action.official}</Badge>}
                  <span className="text-xs text-muted-foreground ml-auto">{format(parseISO(action.date), "MMM d, yyyy")}</span>
                </div>
                {action.description && <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>}
                {action.notes && <p className="text-xs text-muted-foreground/70 mt-0.5">{action.notes}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(action)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><Pencil size={13} /></button>
                <button onClick={() => deleteMut.mutate(action.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── News Sources Tab ───────────────────────────────────────────────────────────

function NewsSourcesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: sources = [] } = useQuery<PoliticalNewsSource[]>({
    queryKey: ["/api/politics/news-sources"],
    queryFn: () => apiRequest("GET", "/api/politics/news-sources").then(r => r.json()),
  });

  const [form, setForm] = useState<Partial<PoliticalNewsSource>>({ reliability: 3 });
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/politics/news-sources", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/news-sources"] }); setShowForm(false); setForm({ reliability: 3 }); toast({ title: "Source added" }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PATCH", `/api/politics/news-sources/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/politics/news-sources"] }); setEditing(null); setForm({ reliability: 3 }); toast({ title: "Updated" }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/politics/news-sources/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/politics/news-sources"] }),
  });

  function openEdit(s: PoliticalNewsSource) { setEditing(s.id); setForm(s); setShowForm(true); }
  function cancel() { setEditing(null); setForm({ reliability: 3 }); setShowForm(false); }
  function submit() {
    if (!form.name?.trim()) return;
    if (editing) updateMut.mutate({ id: editing, data: form });
    else createMut.mutate(form);
  }

  return (
    <div className="space-y-4">
      {!showForm ? (
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5"><Plus size={14} />Add Source</Button>
      ) : (
        <div className="border rounded-xl p-4 bg-secondary/30 space-y-3">
          <h3 className="font-medium text-sm">{editing ? "Edit Source" : "Add News Source"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *">
              <Input value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. NPR, The Atlantic…" />
            </Field>
            <Field label="Type">
              <Select value={form.type ?? ""} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="">Select type…</option>
                {SOURCE_TYPES.map(t => <option key={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="URL">
              <Input value={form.url ?? ""} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://…" />
            </Field>
            <Field label="Bias">
              <Select value={form.bias ?? ""} onChange={e => setForm(f => ({ ...f, bias: e.target.value }))}>
                <option value="">Select bias…</option>
                {BIAS_OPTIONS.map(b => <option key={b} value={b}>{BIAS_META[b].label}</option>)}
              </Select>
            </Field>
            <Field label="Reliability">
              <StarRating value={form.reliability ?? 3} onChange={v => setForm(f => ({ ...f, reliability: v }))} />
            </Field>
            <Field label="Topics">
              <Input value={form.topics ?? ""} onChange={e => setForm(f => ({ ...f, topics: e.target.value }))} placeholder="e.g. Politics, Economy, Foreign" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes ?? ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Why you follow this source, caveats…" />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={submit}><Check size={13} className="mr-1" />{editing ? "Save" : "Add"}</Button>
            <Button size="sm" variant="ghost" onClick={cancel}><X size={13} /></Button>
          </div>
        </div>
      )}

      {sources.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-8">No news sources added yet. Track the outlets you follow and rate their reliability.</p>
      )}

      <div className="space-y-2">
        {sources.map(source => (
          <div key={source.id} className="border rounded-xl bg-card">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              onClick={() => setExpandedId(expandedId === source.id ? null : source.id)}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{source.name}</span>
                  {source.type && <Badge className="bg-secondary text-muted-foreground">{source.type}</Badge>}
                  {source.bias && <Badge className={BIAS_META[source.bias]?.color ?? "bg-secondary"}>{BIAS_META[source.bias]?.label}</Badge>}
                </div>
                {source.reliability && (
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={11} className={i < source.reliability! ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={e => { e.stopPropagation(); openEdit(source); }} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><Pencil size={13} /></button>
                <button onClick={e => { e.stopPropagation(); deleteMut.mutate(source.id); }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"><Trash2 size={13} /></button>
                {expandedId === source.id ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
              </div>
            </div>
            {expandedId === source.id && (
              <div className="px-4 pb-4 border-t pt-3 space-y-2 text-sm">
                {source.url && (
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline text-xs">
                    <Globe size={12} />{source.url} <ExternalLink size={10} />
                  </a>
                )}
                {source.topics && <p className="text-xs text-muted-foreground"><Tag size={11} className="inline mr-1" />{source.topics}</p>}
                {source.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{source.notes}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PoliticsPage() {
  const [activeTab, setActiveTab] = useState("officials");

  const { data: collabs = [] } = useQuery<TabCollaborationWithUser[]>({
    queryKey: ["/api/tab-collaborations"],
    queryFn: () => apiRequest("GET", "/api/tab-collaborations").then(r => r.json()),
  });
  const politicsCollab = collabs.find(c => c.tabName === "politics" && c.status === "accepted");

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
          <Landmark size={20} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Politics & Civic Life</h1>
          <p className="text-sm text-muted-foreground">Track your representatives, issues, elections, and civic engagement</p>
        </div>
      </div>

      {/* Collaboration banner */}
      {politicsCollab && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
          <Users size={14} className="shrink-0" />
          <span>
            Collaborating with <strong>{politicsCollab.otherUser.name}</strong>
            {politicsCollab.role === "collaborator" ? " — viewing their politics" : " — they can see your politics"}
          </span>
        </div>
      )}

      {/* Sub-nav */}
      <div className="flex gap-1 flex-wrap border-b">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={14} />{tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "officials" && <OfficialsTab />}
      {activeTab === "identity"  && <IdentityTab />}
      {activeTab === "issues"    && <IssuesTab />}
      {activeTab === "elections" && <ElectionsTab />}
      {activeTab === "civic"     && <CivicActionsTab />}
      {activeTab === "news"      && <NewsSourcesTab />}
    </div>
  );
}
