/** Names, companies and text templates for the sample data. Fictional; any resemblance to real businesses is coincidental. */
import type { DbProspect } from '@/lib/metrics/types';

export const FIRST_NAMES = ['Aditya', 'Ananya', 'Arjun', 'Bhavna', 'Chirag', 'Deepika', 'Divya', 'Gaurav', 'Harsh', 'Ishaan', 'Jaya', 'Karthik', 'Lakshmi', 'Manish', 'Meera', 'Nikhil', 'Neha', 'Pooja', 'Pranav', 'Priya', 'Rahul', 'Rajesh', 'Riya', 'Rohit', 'Sakshi', 'Sandeep', 'Shreya', 'Siddharth', 'Tanvi', 'Varun', 'Vikram', 'Vivek', 'Yash', 'Zoya', 'Amit', 'Anjali', 'Kunal', 'Mohit', 'Naveen', 'Rashmi', 'Isha', 'Dev', 'Kritika', 'Sameer', 'Aarti', 'Tarun', 'Pallavi', 'Utkarsh'] as const;
export const LAST_NAMES = ['Sharma', 'Gupta', 'Reddy', 'Patel', 'Iyer', 'Nair', 'Kapoor', 'Malhotra', 'Chopra', 'Bansal', 'Agarwal', 'Joshi', 'Desai', 'Menon', 'Pillai', 'Bhatia', 'Khanna', 'Mehra', 'Saxena', 'Verma', 'Banerjee', 'Chatterjee', 'Das', 'Rao', 'Naidu', 'Shetty', 'Kulkarni', 'Jain', 'Singhania', 'Thakur', 'Bose', 'Ghosh', 'Mishra', 'Tiwari', 'Hegde', 'Sinha'] as const;
export const COMPANY_PREFIXES = ['Kaveri', 'Zenith', 'Aarna', 'Bluepeak', 'Sattva', 'Nirmal', 'Orbit', 'Lotus', 'Saffron', 'Vantage', 'Pinnacle', 'Deccan', 'Ganga', 'Indus', 'Meru', 'Tulsi', 'Veda', 'Neon', 'Crimson', 'Aatman', 'Ritu', 'Surya', 'Chandra', 'Navya', 'Prism', 'Kiran', 'Anvi', 'Banyan', 'Marigold', 'Monsoon', 'Rangoli', 'Sahara', 'Tarang', 'Udaan', 'Vistara', 'Yatra'] as const;
export const COMPANY_SUFFIXES = ['Organics', 'Labs', 'Technologies', 'Foods', 'Consulting', 'Digital', 'Learning', 'Realty', 'Fitness', 'Logistics', 'Health', 'Studios', 'Finserv', 'Retail', 'Ventures', 'Interiors'] as const;
export const ROLES = ['Founder & CEO', 'Co-founder', 'Founder', 'Head of Growth', 'Marketing Director', 'COO', 'Managing Partner', 'Chief Revenue Officer', 'Director'] as const;

interface Industry { what: string; audience: string; pains: string[]; redFlag: string }
const INDUSTRY: Record<string, Industry> = {
  Organics: { what: 'direct-to-consumer natural food and skincare products', audience: 'health-conscious urban buyers aged 25–40, mostly via Instagram and marketplaces', pains: ['Repeat purchase rate is flat', 'Paid social costs keep climbing', 'Product education is scattered across posts'], redFlag: 'Heavy dependence on a single marketplace for 60%+ of revenue' },
  Labs: { what: 'a small product studio selling software and analytics tools to SMEs', audience: 'operations heads at 50–500 person companies', pains: ['Demos are not converting to paid pilots', 'Founder is still the main closer', 'No repeatable outbound motion'], redFlag: 'Roadmap is customer-led with no clear ICP' },
  Technologies: { what: 'B2B SaaS for workflow and compliance automation', audience: 'mid-market finance and ops teams', pains: ['Long sales cycles with stalled deals', 'Manual onboarding eats team time', 'Pipeline reporting is spreadsheet-based'], redFlag: 'Two senior sales hires left in the last six months' },
  Foods: { what: 'packaged regional foods sold to modern trade and online', audience: 'families in metros and tier-2 cities', pains: ['Distributor margins are squeezing profit', 'Brand recall is low versus larger players', 'Content is produced ad hoc'], redFlag: 'Working-capital pressure; payment terms with distributors are long' },
  Consulting: { what: 'a boutique advisory practice serving founders and family businesses', audience: 'owner-managed businesses doing ₹10–100 Cr', pains: ['Referrals are the only lead source', 'Proposals take the partners too long', 'Thought leadership is inconsistent'], redFlag: 'Revenue concentrated in three long-standing clients' },
  Digital: { what: 'a performance marketing and web agency', audience: 'D2C brands and local services', pains: ['Client churn after six months', 'Delivery depends on two senior people', 'Cannot differentiate from other agencies'], redFlag: 'Agency is itself looking for a similar vendor — possible tyre-kicking' },
  Learning: { what: 'an online learning and cohort-based courses business', audience: 'working professionals and college students', pains: ['Webinar attendance is high but enrolment is low', 'Course content is not repurposed anywhere', 'Cohort sales rely on one launch a quarter'], redFlag: 'Refund rate in the last cohort was above 12%' },
  Realty: { what: 'a mid-size residential real-estate developer and broker', audience: 'first-time and upgrading home buyers', pains: ['Lead quality from portals is poor', 'Site-visit follow-ups slip through', 'Channel partners are not tracked'], redFlag: 'Sales team uses personal WhatsApp for all follow-ups' },
  Fitness: { what: 'a chain of boutique gyms and a fitness app', audience: 'urban professionals aged 22–38', pains: ['Memberships drop after 90 days', 'Trial-to-paid conversion is under 20%', 'Social content lacks a clear voice'], redFlag: 'Two outlets are underperforming and may close' },
  Logistics: { what: 'a regional freight and last-mile logistics provider', audience: 'SME manufacturers and e-commerce sellers', pains: ['Quotes take days to turn around', 'Customer service is manual and reactive', 'No CRM — all deals live in email'], redFlag: 'Decision-making sits with a promoter who is rarely available' },
  Health: { what: 'multi-specialty clinics and a teleconsult service', audience: 'families within a 10 km catchment', pains: ['Appointments no-show rate is high', 'Reviews are not being collected', 'Referral partnerships are informal'], redFlag: 'Regulatory limits on how services can be advertised' },
  Studios: { what: 'a creative and video production studio', audience: 'brands and agencies needing campaign content', pains: ['Feast-and-famine project pipeline', 'Pricing is project-by-project with no retainers', 'Case studies are not published'], redFlag: 'Notoriously slow payers on two large accounts' },
  Finserv: { what: 'a loan-distribution and wealth advisory firm', audience: 'salaried professionals and small business owners', pains: ['Compliance slows every campaign', 'Lead follow-up depends on telecallers', 'Trust-building content is thin'], redFlag: 'Compliance review required for every claim we would write' },
  Retail: { what: 'a multi-store lifestyle retail brand with a growing online channel', audience: 'shoppers aged 20–45 across tier-1 and tier-2 cities', pains: ['Online and store data are not connected', 'Festival campaigns are planned too late', 'Customer reviews are not used in marketing'], redFlag: 'IT is outsourced and slow to ship changes' },
  Ventures: { what: 'a small holding company incubating three consumer brands', audience: 'varies by brand — mostly young urban buyers', pains: ['Each brand reinvents its own playbook', 'No shared reporting', 'Founders spread thin'], redFlag: 'Priorities change quarter to quarter; scope creep is likely' },
  Interiors: { what: 'a residential and commercial interior design firm', audience: 'homeowners and offices in the ₹30L–2Cr budget band', pains: ['Enquiries are plentiful but few convert', 'Portfolio is not turning into leads', 'Sales cycle is long and relationship-driven'], redFlag: 'Highly seasonal — capacity is stretched in Q4' },
};

const SERVICE_FIT: Record<string, { fit: string; questions: string[] }> = {
  ai_automation: { fit: 'AI Automation Setup — start with lead capture → qualification → CRM sync, then proposal drafting. Quick win in 3–4 weeks.', questions: ['Which manual task eats the most hours each week?', 'Which tools do you already use for CRM and email?', 'Who owns the process day to day?'] },
  webinar_funnel: { fit: 'Webinar Funnel Build — registration page, reminder sequence, replay and a post-webinar call-booking flow.', questions: ['How many registrants and attendees do you get today?', 'What is the offer after the webinar?', 'Do you have a replay sequence?'] },
  content_repurposing: { fit: 'Content Repurposing Retainer — turn long-form calls and webinars into a month of posts, clips and email.', questions: ['What long-form content already exists?', 'Which channels matter most?', 'Who approves content, and how fast?'] },
  sales_process: { fit: 'Sales Process Consulting — map the funnel, define stages and scripts, set up pipeline reporting and coaching.', questions: ['Where do deals stall most often?', 'How many people sell today?', 'What does a win look like in numbers?'] },
  brand_strategy: { fit: 'Brand Strategy Sprint — positioning, messaging and a visual direction brief in two weeks.', questions: ['Who do you lose deals to, and why?', 'How would customers describe you in one line?', 'What would "better branding" change in revenue?'] },
};

export function buildBrief(a: { prospect: DbProspect; service: string; serviceType: string; source: string; consultant: string; u: () => number; pick: <T>(xs: readonly T[]) => T }): { markdown: string; sources: { title: string; url: string }[] } {
  const suffix = (a.prospect.company ?? '').split(' ').pop() ?? 'Ventures';
  const ind = INDUSTRY[suffix] ?? INDUSTRY.Ventures!;
  const fit = SERVICE_FIT[a.serviceType] ?? SERVICE_FIT.ai_automation!;
  const employees = a.pick(['11–30', '30–60', '60–120', '120–250']);
  const founded = 2008 + Math.floor(a.u() * 15);
  const host = (a.prospect.website ?? '').replace(/^https?:\/\/(www\.)?/, '');
  const markdown = `## Company snapshot
**${a.prospect.company}** is ${ind.what}. Founded around ${founded}, roughly ${employees} people. ${a.prospect.name} (${a.prospect.role}) booked through **${a.source.replace(/_/g, ' ')}**.

## What they offer
${ind.what.charAt(0).toUpperCase() + ind.what.slice(1)}. Their site (${host}) leads with a product grid and a "talk to us" call to action; pricing is not public.

## Audience
${ind.audience}.

## Likely pain points
${ind.pains.map((p) => `- ${p}`).join('\n')}

## Service fit — ${a.service}
${fit.fit}

## Suggested questions
${fit.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
${fit.questions.length + 1}. What have you already tried, and what happened?

## Red flags
- ${ind.redFlag}
- Budget not yet confirmed — ask early.

_Prepared for ${a.consultant}. Sources below were read automatically; verify anything that matters before the call._`;
  return {
    markdown,
    sources: [
      { title: `${a.prospect.company} — website`, url: a.prospect.website ?? '' },
      { title: `${a.prospect.name} — LinkedIn`, url: a.prospect.linkedin_url ?? '' },
      { title: `${a.prospect.company} in the news`, url: `https://news.example.com/search?q=${encodeURIComponent(a.prospect.company ?? '')}` },
      { title: 'Industry benchmark report', url: 'https://reports.example.com/india-sme-growth-benchmarks' },
    ],
  };
}

export function buildTranscript(a: { prospect: DbProspect; consultant: string; serviceType: string; price: number; u: () => number; pick: <T>(xs: readonly T[]) => T }): string {
  const first = (a.prospect.name ?? 'there').split(' ')[0]!;
  const consultant = a.consultant.split(' ')[0]!;
  const suffix = (a.prospect.company ?? '').split(' ').pop() ?? 'Ventures';
  const ind = INDUSTRY[suffix] ?? INDUSTRY.Ventures!;
  const pain = a.pick(ind.pains).toLowerCase();
  const budgetLakhs = Math.max(0.5, Math.round((a.price / 100_000) * (0.6 + a.u() * 0.9) * 10) / 10);
  const timeline = a.pick(['next month', 'after the festive season', 'as soon as possible', 'in about six weeks', 'next quarter']);
  const lines = [
    `${consultant}: Thanks for making time, ${first}. Walk me through where ${a.prospect.company} is today.`,
    `${first}: Sure. We're ${ind.what}. Honestly the biggest thing right now is that ${pain}.`,
    `${consultant}: How long has that been the case, and what have you tried so far?`,
    `${first}: About two quarters. We tried a couple of freelancers but nothing stuck. I don't have a lot of time to manage it.`,
    `${consultant}: Understood. Based on what you've said, ${a.serviceType.replace(/_/g, ' ')} looks like the right starting point. I'll send a proposal with scope and timeline.`,
    `${first}: That works. Budget-wise we've set aside around ₹${budgetLakhs} lakh for this. We'd want to start ${timeline}.`,
    `${consultant}: Great. I'll have the proposal over to you shortly. Anything else I should include?`,
    `${first}: A clear deliverables list and a payment schedule, please.`,
  ];
  return lines.join('\n');
}
