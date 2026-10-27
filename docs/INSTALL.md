# Installing CIRKS

This guide takes you from an empty Ubuntu machine to a working CIRKS, in one of
two forms:

- **A. A training instance** loaded with **Misty Isles Government (MIG)**, a
  fictional organisation with a year of risk management already done: about 50
  systems, 228 risks, security actions, exceptions and minuted meetings. Use it
  to learn CIRKS, to demonstrate it, or to try things out. **Never put real
  information in it.**
- **B. Your organisation's instance**: an empty CIRKS holding only its reference
  data (roles and permissions, the NIST CSF 2.0 control objectives, impact
  descriptors). You load your organisation into it.

Parts 1 and 2 are the same for both. Part 3A or 3B then makes it one or the
other. Use **separate machines** (or VMs) for the two: one CIRKS per machine, and
a training instance is never turned into a real one.

> **Checked end to end on 2026-10-15** at schema 0159 — Ubuntu 25.10 (arm64),
> Docker 29.7.2, Compose v5.4 — by following this guide from a fresh clone on
> fresh Docker volumes, once for each path.
>
> **Also installed on 2026-10-22** by an outside tester on Ubuntu 26.04 LTS
> (x86_64) under VMware Workstation Pro, with Docker from apt (`docker.io`).
> That install is where the snap check in 1.1 comes from.
>
> [`deployment.md`](deployment.md) is the operations runbook (upgrades,
> rollback, air-gapped installs, backup and restore, TLS options, secrets). This
> file is the straight line from nothing to a working CIRKS.

**To install with nobody at the keyboard** — a training VM from a cloud-init
file, or a script — see [Unattended install](#unattended-install) after Part 3B.
It runs this guide's own commands.

**What you need:** an Ubuntu machine or VM (2 CPUs, 4 GB memory and 20 GB disk is
plenty) where you can use `sudo`, and internet access while installing.

---

## Part 1 — Prepare the machine

### 1.1 Check the host

<!-- install.sh: 1.1 -->
```bash
. /etc/os-release && echo "$PRETTY_NAME"; uname -m
docker --version 2>/dev/null || echo "docker: not installed"
git --version    2>/dev/null || echo "git: not installed"
snap list docker curl 2>/dev/null || true         # should print nothing
```

**If that last line lists `docker`, remove the snap before going further.** The
Ubuntu installer offers Docker on its *featured snaps* screen, and the snap's
confinement refuses to start the CIRKS application container: it fails at once
with `exec /usr/local/bin/cirks-entrypoint: operation not permitted` and
restarts in a loop, while the database and Caddy run normally. CIRKS needs the
`docker.io` package from apt (1.2). On a new machine, with nothing in Docker
yet:

```bash
sudo snap remove --purge docker      # --purge also deletes the snap's containers and volumes
```

If it lists `curl`, swap that too (`sudo snap remove curl`; 1.2 installs it from
apt). The snap works, but prints a banner that muddles the health-check output
in 2.4.

### 1.2 Install Docker and Git

CIRKS runs as three containers: the application, a PostgreSQL 17 database, and a
Caddy web server in front of them. You need Docker Engine with the **Compose v2**
plugin.

<!-- install.sh: 1.2-install -->
```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 docker-buildx git curl
sudo usermod -aG docker "$USER"
```

> If `docker-compose-v2` is not found (older Ubuntu), install Docker from
> Docker's own repository instead: <https://docs.docker.com/engine/install/ubuntu/>.

**Log out and back in** so the group change takes effect, then check — without
`sudo`:

<!-- install.sh: 1.2-check -->
```bash
docker compose version          # must report v2 or later
docker buildx version           # the image builder; without it Compose warns "buildx isn't installed"
docker run --rm hello-world
```

### 1.3 Get the source

The image is built from source on this machine:

```bash
git clone https://github.com/WightmanBrown/cirks.git ~/cirks
cd ~/cirks
```

To install a particular release rather than the latest code, add
`--branch v1.0.0` (any tag from the
[releases page](https://github.com/WightmanBrown/cirks/releases)).

`ls` should show `Dockerfile`, `docker-compose.yml`, `import/`, `riskapp/`,
`deploy/` and `docs/`.

---

## Part 2 — Configure and start CIRKS

### 2.1 Write the configuration file

CIRKS reads its settings from `.env`, which is never committed. Copy the template
and generate the secrets (`openssl` comes with Ubuntu). The secrets are made
**once**: if `.env` already exists, the block leaves it alone, because new
secrets on a CIRKS that has started would no longer match its database.

<!-- install.sh: 2.1 -->
```bash
cd ~/cirks
if [ -e .env ]; then
  echo ".env already exists: keeping its secrets"
else
  cp .env.docker.example .env
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|"               .env
  sed -i "s|^APP_DB_PASSWORD=.*|APP_DB_PASSWORD=$(openssl rand -hex 24)|"       .env
  sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -hex 64)|"   .env
  sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 64)|" .env
  chmod 600 .env
fi
```

- `DB_PASSWORD` is the database owner's password.
- `APP_DB_PASSWORD` turns on the **restricted database role**: the running
  application connects as `cirks_app`, which can read and write data but cannot
  change or drop the database's structure. Upgrades still run as the owner.
  Keep it on.
- The two `JWT_` secrets sign people's sign-in tokens and must differ from each
  other. Anyone holding them can sign in as anyone: guard them like the database
  password.

> **These are machine secrets, not your password.** Each `openssl rand` line
> writes a long random value into `.env`. Nobody types them, and none of them
> signs you in to CIRKS. You choose your own sign-in password in Part 3, and
> it is kept in the database, not in `.env`. 2.2 adds more lines to `.env`;
> you save a copy of the finished file after 2.3. **Do not
> edit these values once CIRKS has started.** To change them, see
> [Changing the generated secrets](#changing-the-generated-secrets) in Part 4.

### 2.2 Choose the name people will use

People reach CIRKS through Caddy, over HTTPS, at a **host name**. Not a bare IP
address: browsers cannot select a certificate for one, and the connection fails.
Set the name, how the certificate is made, and that Caddy always runs:

<!-- install.sh: 2.2 -->
```bash
sed -i "s|^CIRKS_DOMAIN=.*|CIRKS_DOMAIN=cirks.local|" .env
sed -i "s|^CIRKS_TLS=.*|CIRKS_TLS=tls internal|"      .env
grep -q '^COMPOSE_FILE=' .env ||
  printf '\n# Always run with the bundled Caddy (docs/INSTALL.md 2.2)\nCOMPOSE_FILE=docker-compose.yml:deploy/docker-compose.tls.yml\n' >> .env
```

Every block in Part 2 is safe to run again: 2.1 keeps an existing `.env` and
its secrets, and the lines above set a value, or add a line only if it is
missing.

- **`CIRKS_TLS=tls internal`** — Caddy makes its own certificate. Browsers
  warn until you trust it (2.4). Right for a training VM, or an internal server
  with no public DNS.
- **`CIRKS_TLS=`** (blank) — a free Let's Encrypt certificate. Only for a name
  in **public** DNS pointing at this machine, with ports 80 and 443 open from the
  internet. Otherwise Caddy keeps retrying and serves nothing.
- **Your own certificate** — put `cert.pem` and `key.pem` in `deploy/certs/`
  and set `CIRKS_TLS=tls /certs/cert.pem /certs/key.pem`.

The `COMPOSE_FILE` line makes every `docker compose` command include Caddy, so
you never need `-f` options.

> **Why Caddy from the start.** The application container is on an internal
> network with no route out — CIRKS makes no outbound connections, and this
> stops a compromised application from making any. Current Docker (28 and
> later) also does not publish ports for a container only on an internal
> network, so `http://<machine>:8080` does **not** answer. Caddy sits on both
> networks and is the way in.

### 2.3 Start it

The first start builds the image: a few minutes, and it needs the internet.
Later starts take seconds.

<!-- install.sh: 2.3 -->
```bash
cd ~/cirks
docker compose up -d --build
until [ "$(docker compose ps app --format '{{.Health}}')" = healthy ]; do sleep 5; done
docker compose ps               # app and db "healthy", caddy "Up"
docker compose logs app | grep -E "entrypoint|seed|listening"
```

The `until` line waits for the application to finish starting: a minute or
two the first time, while it creates and seeds the database. If it is still
waiting after five minutes, press Ctrl-C and look at `docker compose logs app`.

On the first start the log shows the database being created and seeded —
capabilities, standards, role permissions, the impact descriptors and the NIST
CSF 2.0 catalogue (106 control objectives) — then `App will connect as
restricted role 'cirks_app'` and `riskapp listening`.

**Now save a copy of `.env`** somewhere safe, apart from the machine: it is
complete, and a restore is much quicker with it. It holds secrets, so keep it
where you would keep a password. (If you clone the VM below, save the training
clone's `.env` again once you have changed its secrets.)

> **On a virtual machine, now is the time to clone it.** CIRKS is installed,
> configured and running, but holds no organisation yet. One VM can become two:
> a **training** instance for Part 3A and an **operational** one for Part 3B.
> Shut the VM down (`sudo poweroff`) and clone it in your hypervisor. Choose to
> give the clone a new MAC address, so that it gets its own IP address.
>
> A clone is an exact copy, so the two machines share every secret in `.env`
> and Caddy's certificate authority. On the clone you use for **training**:
>
> 1. Give it its own host name, for example
>    `sudo hostnamectl set-hostname cirks-training`.
> 2. Change all four generated secrets, as in
>    [Changing the generated secrets](#changing-the-generated-secrets).
>    Otherwise anyone who can read the training machine's `.env` holds the keys
>    to the operational one.
> 3. Give CIRKS its own name, and let Caddy make a new certificate authority:
>
>    ```bash
>    cd ~/cirks
>    sed -i "s|^CIRKS_DOMAIN=.*|CIRKS_DOMAIN=cirks-training.local|" .env
>    docker compose rm -sf caddy
>    docker volume rm cirks_caddy_data cirks_caddy_config
>    docker compose up -d
>    ```
>
> Then carry on from 2.4 on each machine. Use `cirks-training.local` wherever
> the guide says `cirks.local` on the training machine.

### 2.4 Make the name resolve, and check

If `cirks.local` is not in your DNS, map it in the hosts file — on this machine
to itself, and on every computer people will browse from to this machine's
address (`hostname -I` shows it):

<!-- install.sh: 2.4 -->
```bash
grep -q '\scirks\.local$' /etc/hosts ||
  echo "127.0.0.1  cirks.local" | sudo tee -a /etc/hosts      # on the CIRKS machine
curl -sk https://cirks.local/health                           # expect {"status":"ok",…}
```

**Browsing from the CIRKS machine itself.** On a training VM running Ubuntu
Desktop, you can simply use the browser inside the VM: the line above is all it
needs, and nothing on your own computer changes. The steps below for other
computers then do not apply.

On Windows, add `<machine address>  cirks.local` to
`C:\Windows\System32\drivers\etc\hosts`, editing as Administrator. If a firewall
runs on the CIRKS machine, allow 80 and 443 (`sudo ufw allow 80,443/tcp`) — and
your SSH port first, so you do not lock yourself out.

Open **`https://cirks.local/`**: you should see the CIRKS sign-in page. Nobody
can sign in yet — accounts come in Part 3.

**To stop the certificate warning** (with `tls internal`), copy Caddy's own
certificate authority out and add it to each computer's trusted roots:

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./cirks-root.crt
```

On Windows, double-click the file → *Install Certificate* → *Local Machine* →
*Trusted Root Certification Authorities*. On macOS, open it in Keychain Access
and set it to *Always Trust*. In Firefox (including the one inside an Ubuntu
VM, which keeps its own list): *Settings* → *Privacy & Security* → *View
Certificates* → *Authorities* → *Import*, and tick *Trust this CA to identify
websites*.

**Now choose: Part 3A for a training instance, Part 3B for your organisation.**

---

## Part 3A — Training instance: load Misty Isles

One command builds the whole organisation, inside the application container, in
about six minutes:

<!-- install.sh: 3A -->
```bash
cd ~/cirks
docker compose exec app node riskapp/db/dataset/misty-isles/install.js
```

First it asks for **the administrator's password** — typed twice, not shown, at
least 12 characters and at most 72 bytes (the rule is in 3B.1). There is no
default. Then it reports eight steps as it
goes. It builds the organisation from its story, imports it, then works through
a year of risk management through CIRKS's own interface as the people who would
have done it: a first risk assessment, the backlog, security actions,
exceptions, review cycles and meetings, the security architecture and the
security solutions. It **refuses a database that already has departments**, and
stops at the first step that fails.

When it finishes, sign in at `https://cirks.local/` as **`A.James@mig.local`**,
the administrator, with the password you chose.

**Every other Misty Isles account is locked.** The accounts stay active — so
risks, systems and services keep their owners — but each has a random password
nobody knows. To use one (the CISO, `ciso@mig.local`, is a good start; the SIRO
is `siro@mig.local`), set its password on **Admin → Account Management → Reset
password**, then sign in as it. Even so, this instance must never hold real
information.

> For an unattended build, give the password in the environment instead of at
> the prompt: `docker compose exec -e ADMIN_PASSWORD='…' app node riskapp/db/dataset/misty-isles/install.js`.

What you get (checked 2026-10-15): 12 departments, 31 people, 52 systems and 228
risks — 77 at or above the mandatory-action score of 12, from the story's
deliberate problems — with a validation backlog, 5 security actions, 5
exceptions (one lapsed), 5 meetings and 4 quarterly review cycles. Dates are
relative to the day you run it. The story behind it is
[`dataset/misty-isles-architecture.md`](dataset/misty-isles-architecture.md).
To find your way around it role by role, read the walkthrough,
[`dataset/misty-isles-walkthrough.md`](dataset/misty-isles-walkthrough.md).

**To start again from nothing** (deletes the database):

```bash
docker compose down -v && docker compose up -d
# wait until docker compose ps shows app "healthy", then run install.js again
```

---

## Part 3B — Your organisation: start from an empty CIRKS

### 3B.1 Create the first administrator

There is no built-in account. Create yours; it asks for the password twice:

```bash
cd ~/cirks
docker compose exec app node riskapp/db/create-admin.js --email you@example.org --name "Your Name"
```

> **The password rule, wherever CIRKS sets a password** (these tools, the
> importer, and *Account Management*): **at least 12 characters and at most 72
> bytes.** bcrypt, which CIRKS uses to store passwords, ignores everything after
> the first 72 bytes, so CIRKS refuses a longer password rather than quietly use
> only its start. 72 bytes is 72 plain English characters; accented and other
> non-English letters take two bytes or more each.

Sign in at `https://cirks.local/` with that email and password.

### 3B.2 Capture the organisation in the workbook

Fill in [`templates/CIRKS-organisation-capture.xlsx`](templates/CIRKS-organisation-capture.xlsx):
one sheet per kind of record, in load order — departments, people and their
roles, impact tables, information assets and their ratings, systems, business
services. Its *Read me* sheet explains every column, and
`CIRKS-organisation-capture-EXAMPLE.xlsx` is a small worked example.

Two rules decide most questions:

- **A department is the level that has an Information Asset Owner.** If the
  organisation has major departments with minor ones under them, record the
  major ones — see *Major and minor departments* in
  [`modelling-patterns.md`](modelling-patterns.md).
- **Only record what helps answer a security question** — *The line*, in the
  same file.

### 3B.3 Save the sheets as CSV files in `import/`

Save each sheet as **CSV UTF-8** into the `import/` folder of the checkout
(`~/cirks/import/`), under the file name its *Read me* row gives
(`departments.csv`, `users.csv`, …). In Excel: select the sheet, then *File →
Save a Copy → CSV UTF-8 (Comma delimited)*. Leave out sheets you have not used.

**Add a threat catalogue.** CIRKS comes with no threats, and without them no
risk can be recorded. A starting set of 20 common threats is provided:

```bash
cp ~/cirks/docs/templates/starter-threats.csv ~/cirks/import/threats.csv
```

Each starts with a likelihood of 3 (*Annual*) for confidentiality, integrity and
availability. That is a placeholder, not an assessment: set each threat's
likelihood for your organisation (**Risk Management → Threats**) before you
assess risks. Add, rename or remove rows to suit.

The application sees `~/cirks/import/` as `/import`, read-only. Copying files
into the container does not work: its file system is read-only.

### 3B.4 Check, then load

Check first. Every row is tried and then rolled back, so nothing is written.
Give it the starting password you will load with (below), so the check covers
that too — it must meet the password rule (3B.1):

```bash
docker compose exec app node riskapp/db/import.js /import --dry-run --password '<starting password>'
```

Each file reports `imported / skipped / errors`, and each error names the row and
the reason — say, a department spelt differently on two sheets, or a value the
drop-down would not have allowed. Fix the sheet, save it again, and repeat until
every line reads `errors 0`.

Then load it, choosing a **starting password** for the new accounts:

```bash
docker compose exec app node riskapp/db/import.js /import --password '<starting password>'
```

- There is no default password: a person with no password, loaded without
  `--password`, is refused.
- **Everyone gets the same starting password, and CIRKS has no "change my
  password" screen yet.** After the load, set each person's own password on
  **Admin → Account Management → Reset password**, and pass it to them
  yourself.
- Loading again is safe: anything already there is skipped.
- The load ends by bringing the security record up to date: every system's
  control objectives get their status from their security solutions. For a
  large organisation that can take a minute, and the report says
  `security record: settled`.

Once it has loaded, **delete the files from `import/`** — the people sheet lists
everyone who can sign in:

```bash
rm ~/cirks/import/*.csv
```

### 3B.5 What next

- Sign in as the CISO and as an Information Asset Owner and look around: the
  departments, systems and services you loaded, and the impact each system takes
  from its information assets.
- Work through [`modelling-sequence.md`](modelling-sequence.md) — the order in
  which an organisation is modelled: interview top down, enter bottom up.
- CIRKS starts in its **setup phase**. When onboarding is finished, a person with
  the *security consultant* role moves it to operational (one way only).
- **Do not load Misty Isles into this instance**, and never use its password.

---

## Unattended install

`deploy/install.sh` follows Parts 1 and 2 of this guide, then Part 3A or 3B.1,
with nobody at the keyboard. It runs the guide's own commands: each block marked
for it in this file is copied into the script word for word, CI fails if the two
ever differ, and CI installs CIRKS with the script on new Ubuntu machines (x86_64
and arm64) to prove the commands work.

Run it on a new Ubuntu machine, as an ordinary user who can use `sudo` without a
password prompt, from the checkout at `~/cirks` (1.3). The administrator's
password follows the password rule (3B.1):

```bash
ADMIN_PASSWORD='…' ~/cirks/deploy/install.sh --training     # Misty Isles, as 3A

ADMIN_PASSWORD='…' ADMIN_EMAIL=you@example.org ADMIN_NAME='Your Name' \
  ~/cirks/deploy/install.sh --empty                         # your organisation: 3B.1, then carry on from 3B.2
```

It stops, before changing anything, if Docker is installed as a snap (1.1) or
the password breaks the rule. CIRKS is at `https://cirks.local/`, as in the
guide.

**A training VM from a cloud-init file.**
[`deploy/cloud-init/cirks-training.yaml`](https://github.com/WightmanBrown/cirks/blob/main/deploy/cloud-init/cirks-training.yaml)
builds a Misty Isles training instance on a new Ubuntu cloud-image VM (24.04 or
later; 2 CPUs, 4 GB memory, 20 GB disk) — in Multipass, LXD, a cloud provider,
or any hypervisor that takes cloud-init user data. For example:

```bash
curl -fsSLO https://raw.githubusercontent.com/WightmanBrown/cirks/main/deploy/cloud-init/cirks-training.yaml
multipass launch 24.04 --name cirks --cpus 2 --memory 4G --disk 20G \
  --cloud-init cirks-training.yaml
```

It clones the latest release and runs `install.sh --training` as the image's
default user, `ubuntu`; allow about 20 minutes. The administrator's password is
random, and is written to `/home/ubuntu/cirks-admin-password.txt`, which only
`ubuntu` can read: no password is kept in the cloud-init file, which stays on
the VM. Progress is in `/home/ubuntu/cirks-install.log`, and
`cloud-init status --wait` returns once it has finished. The file says where to
add your SSH key.

---

## Part 4 — Looking after it

### Regular maintenance

| When | What | How |
|---|---|---|
| Every night, automatically | Back up the database and the meeting attachments | [Back up](#back-up), scheduled with `cron` |
| Every day | Copy the night's backup off the machine | Your usual backup or file-transfer tool. A backup on the same disk is lost with the disk |
| Every week | Check the backup ran and CIRKS is up | `tail -3 ~/cirks/backups/backup.log`, `docker compose ps` |
| Every month | Update Ubuntu, the database and Caddy, and check the disk | See below |
| When a new CIRKS version is released | Upgrade | [Upgrade](#upgrade) |
| Every three months | Restore the latest backup onto a spare VM, and sign in to it | [Restore onto a wiped machine](#restore-onto-a-wiped-machine). Until a backup has been restored, it is only a hope |
| Every three months | Review the accounts: people who have left are deactivated, roles are still right | **Admin → Account Management** |
| When someone who could read `.env` leaves, or it may have been exposed | Change the secrets | [Changing the generated secrets](#changing-the-generated-secrets) |

The monthly update, after a backup:

```bash
sudo apt-get update && sudo apt-get upgrade -y
cd ~/cirks
docker compose pull db caddy           # security fixes in PostgreSQL 17 and Caddy
docker compose build --pull app        # rebuilds CIRKS on the updated base image
docker compose up -d
docker image prune -f                  # removes the images just replaced
df -h /                                # keep at least 5 GB free
```

If `/var/run/reboot-required` exists, reboot with `sudo reboot`. CIRKS starts
again by itself.

### Back up

A backup is **two files with the same timestamp**: the database, and the
meeting attachments it refers to. A restore needs both. The script writes them
into `~/cirks/backups/`, readable only by you, and deletes its own backups older
than 30 days (`KEEP_DAYS=60` keeps 60):

```bash
~/cirks/deploy/backup.sh
# wrote backups/cirks-db-<UTC>.sql.gz (…) and backups/cirks-attachments-<UTC>.tar.gz (…)
```

To run it every night at 02:15, run `crontab -e` and add this line:

```
15 2 * * * $HOME/cirks/deploy/backup.sh >> $HOME/cirks/backups/backup.log 2>&1
```

Keep two more things off the machine, apart from the nightly backups, and
update them whenever they change: **`.env`**, and your own certificate files in
`deploy/certs/` if you use them (2.2). A backup holds everything in CIRKS,
including password hashes, so store it as carefully as the system itself.

### Restore onto a wiped machine

This rebuilds CIRKS from a backup when the machine, its disk or its Docker
volumes are gone, or onto a new machine. You need the pair of backup files and,
ideally, the saved `.env`.

**1. Prepare the machine.** Follow Part 1 again (1.1 to 1.3). Use the same
version of CIRKS as the backup, or a newer one, never an older one. The latest
is fine: CIRKS upgrades a restored database as it starts, and takes a backup of
it first.

**2. Put back the configuration and the backup:**

```bash
cd ~/cirks
cp /path/to/saved/.env .env && chmod 600 .env
mkdir -p backups
cp /path/to/saved/cirks-db-<UTC>.sql.gz /path/to/saved/cirks-attachments-<UTC>.tar.gz backups/
```

Lost `.env`? Do 2.1 and 2.2 again instead. New secrets work with an old
backup: everyone's sign-in password is in the database, not in `.env`. Put back
`deploy/certs/` if you use your own certificate.

**3. Start only the database, and load the backup into it.** Do not start
the application yet. On its first start it creates a new, empty CIRKS, and the
backup cannot be loaded on top of that.

```bash
docker compose up -d db
docker compose ps db                   # wait until it shows "healthy"
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE ROLE cirks_app LOGIN"'
gunzip -c backups/cirks-db-<UTC>.sql.gz \
  | docker compose exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

The first `psql` replies `CREATE ROLE`. It creates the restricted role, which
the backup grants permissions to; CIRKS sets its password as it starts. The
load prints nothing when it succeeds. It loads all or nothing, so if it stops
with an error, nothing was loaded: fix the cause and run it again. `role
"cirks_app" does not exist` means the `CREATE ROLE` line was skipped.

**4. Start CIRKS, then put back the attachments:**

```bash
docker compose up -d --build
docker compose ps                      # app and db "healthy", caddy "Up"
docker compose logs app | grep -E "Schema present|listening"
docker compose exec -T app tar -C /app/riskapp/uploads -xzf - < backups/cirks-attachments-<UTC>.tar.gz
```

The log shows `Schema present`, meaning it found the restored database rather
than creating a new one, and then `riskapp listening`.

**5. Check.** Follow 2.4: with `tls internal`, Caddy has made a new
certificate, so each browser must trust it again. Sign in with an account and
password from before the backup, and open a meeting with attachments.

**Going back to a backup on a machine that still runs** works the same way.
`docker compose down -v` deletes the database, the attachments and Caddy's
certificates. Then carry on from step 3, using the `.env` already there.

### Upgrade

```bash
cd ~/cirks && git pull && docker compose up -d --build
docker compose logs app | grep entrypoint
```

Before changing the database the application backs it up (into its `backups`
Docker volume), then applies the changes and starts. Take your own backup first
as well: that one is off the machine.

### Forgotten administrator password

```bash
docker compose exec app node riskapp/db/reset-password.js --email you@example.org
```

### Changing the generated secrets

The four values from 2.1 do not expire, and there is no need to change them on
a schedule. Change them when they may have been seen by someone who should not
have them:

- `.env`, or a copy of it, has been exposed: sent, committed, left in a shared
  folder, or included in a copied disk image or VM snapshot.
- Someone who could read it has left or changed role. That is anyone with
  `sudo` on this machine or in the `docker` group, because
  `docker compose exec app env` shows every secret.
- You suspect CIRKS or this machine has been compromised.

If in doubt, change all four. Each change is made from `~/cirks`.

**The JWT secrets.** Edit them in place and restart the application:

```bash
cd ~/cirks
sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -hex 64)|"   .env
sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 64)|" .env
docker compose up -d
```

Everyone is signed out and must sign in again. Their passwords do not change,
and machine API keys keep working. If the secrets may have been stolen, anyone
holding them could have acted as any user, and CIRKS cannot tell their actions
apart from real sign-ins. Review **Admin → Audit log** for the period, and
revoke and re-issue any API keys.

**`APP_DB_PASSWORD`.** Edit it and restart. The application sets the
restricted role's new password itself as it starts:

```bash
cd ~/cirks
sed -i "s|^APP_DB_PASSWORD=.*|APP_DB_PASSWORD=$(openssl rand -hex 24)|" .env
docker compose up -d
```

**`DB_PASSWORD`.** **Do not just edit `.env`.** The database records this
password once, when it is first created, and ignores the value in `.env` after
that. Editing only `.env` stops CIRKS starting. Change it in the database
first, then in `.env`:

```bash
cd ~/cirks
NEW=$(openssl rand -hex 24)
echo "ALTER ROLE CURRENT_USER PASSWORD '$NEW';" \
  | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$NEW|" .env
unset NEW
docker compose up -d
```

`psql` replies `ALTER ROLE`. After any of these changes, check that
`docker compose ps` shows the app `healthy`, then sign in. Replace your saved
copy of `.env` with the new one. Database backups are unaffected, because they
do not contain these secrets.

---

## Troubleshooting

| What you see | Why, and what to do |
|---|---|
| After loading an organisation with `import.js`, every save takes about 15 seconds, the *Findings* page or a meeting agenda says *An unexpected error occurred*, and `docker compose logs app` shows `[settle] canceling statement due to statement timeout` | The load was made before v1.0.4, which left the security record unsettled; the application's first attempt to settle it runs out of time, and so does every attempt after. Settle it once as the database owner: `docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT settle_system_security()"'`. It prints how many changes it made; run it again and it prints 0. |
| The app container restarts in a loop with `exec /usr/local/bin/cirks-entrypoint: operation not permitted`; the database and Caddy are fine | Docker is the snap, not the apt package (`snap list docker`). The snap's confinement clashes with the app container's hardening. Remove the snap and install `docker.io` from apt (1.1, 1.2), then `docker compose up -d --build` again. |
| `curl https://cirks.local/health` fails, though the containers are up | The name does not resolve (2.4); or `.env` lacks the `COMPOSE_FILE` line, so Caddy is not running — `docker compose ps` shows no `caddy`. |
| `tlsv1 alert internal error` | `CIRKS_DOMAIN` is an IP address or a placeholder. Use a host name (2.2), then `docker compose up -d --force-recreate caddy`. |
| The browser says the certificate is not trusted | Expected with `tls internal`: continue, or trust Caddy's certificate authority (2.4). |
| `http://<machine>:8080` does not answer | Expected — CIRKS is reached only through Caddy on 443 (2.2). |
| Sign-in answers *Too many requests* | The sign-in throttle: 20 attempts per 15 minutes from one address. Wait, or raise `AUTH_RATE_LIMIT_MAX` in `.env` and run `docker compose up -d app`. |
| `docker compose cp` into the app says *read-only* | Expected. Put files in `~/cirks/import/` instead (3B.3). |
| The Misty Isles install says the database already has departments | It only goes into an empty instance. Start again from nothing (3A) — on a training machine only. |
| An import row says *no password* | Load with `--password` (3B.4). |
