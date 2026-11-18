export interface Fail2BanJailPreset {
  jail_name: string;
  is_enabled: false;
  max_retries: number;
  ban_time: number;
  find_time: number;
  log_path: string;
  filter_name: string;
  action: string;
  description: string;
}

export const DEFAULT_FAIL2BAN_JAILS: readonly Fail2BanJailPreset[] = [
  {
    jail_name: "sshd",
    is_enabled: false,
    max_retries: 5,
    ban_time: 3600,
    find_time: 600,
    log_path: "/var/log/auth.log",
    filter_name: "sshd",
    action: "iptables-multiport",
    description: "SSH authentication failures; Ubuntu auth log path.",
  },
  {
    jail_name: "nginx-http-auth",
    is_enabled: false,
    max_retries: 5,
    ban_time: 3600,
    find_time: 600,
    log_path: "/var/log/nginx/error.log",
    filter_name: "nginx-http-auth",
    action: "iptables-multiport",
    description: "Repeated failed HTTP authentication through Nginx.",
  },
  {
    jail_name: "nginx-botsearch",
    is_enabled: false,
    max_retries: 3,
    ban_time: 3600,
    find_time: 600,
    log_path: "/var/log/nginx/access.log",
    filter_name: "nginx-botsearch",
    action: "iptables-multiport",
    description: "Repeated scans for common private or vulnerable paths.",
  },
  {
    jail_name: "nginx-limit-req",
    is_enabled: false,
    max_retries: 5,
    ban_time: 600,
    find_time: 600,
    log_path: "/var/log/nginx/error.log",
    filter_name: "nginx-limit-req",
    action: "iptables-multiport",
    description: "Nginx request-limit violations.",
  },
  {
    jail_name: "postgresql",
    is_enabled: false,
    max_retries: 5,
    ban_time: 3600,
    find_time: 600,
    log_path: "/var/log/postgresql/postgresql-*.log",
    filter_name: "postgresql",
    action: "iptables-multiport",
    description: "Repeated PostgreSQL authentication failures.",
  },
  {
    jail_name: "recidive",
    is_enabled: false,
    max_retries: 5,
    ban_time: 604800,
    find_time: 86400,
    log_path: "/var/log/fail2ban.log",
    filter_name: "recidive",
    action: "iptables-allports",
    description: "Longer ban for repeat offenders already caught by Fail2Ban.",
  },
];
