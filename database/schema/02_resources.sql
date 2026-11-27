-- --------------------------- PROVIDERS AND PROJECTS --------------------------
CREATE TABLE ProviderHosts (
    host_id INT AUTO_INCREMENT PRIMARY KEY,
    provider_user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    region VARCHAR(50) NOT NULL,
    hosting_class ENUM('Economy','Business','Critical') NOT NULL,
    status ENUM('available','maintenance','inactive') NOT NULL DEFAULT 'available',
    total_cpu INT NOT NULL,
    total_ram_gb INT NOT NULL,
    total_disk_gb INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hosts_provider FOREIGN KEY (provider_user_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_host_name_per_provider UNIQUE (provider_user_id, name),
    CONSTRAINT uq_host_id_class UNIQUE (host_id, hosting_class),
    CONSTRAINT ck_hosts_capacity CHECK (total_cpu > 0 AND total_ram_gb > 0 AND total_disk_gb > 0),
    KEY idx_hosts_match (region,hosting_class,status)
) ENGINE=InnoDB;

CREATE TABLE ResourceGroups (
    group_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    region VARCHAR(50) NOT NULL,
    status ENUM('active','deleted') NOT NULL DEFAULT 'active',
    deleted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_groups_customer FOREIGN KEY (customer_user_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_group_owner UNIQUE (group_id, customer_user_id),
    CONSTRAINT uq_group_per_customer UNIQUE (customer_user_id, name),
    CONSTRAINT ck_groups_deleted CHECK (status <> 'deleted' OR deleted_at IS NOT NULL)
) ENGINE=InnoDB;

-- --------------------------- NETWORKS AND COMPUTE ----------------------------
CREATE TABLE VirtualNetworks (
    vnet_id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    cidr_block VARCHAR(43) NOT NULL,
    status ENUM('active','deleted') NOT NULL DEFAULT 'active',
    deleted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vnets_group FOREIGN KEY (group_id) REFERENCES ResourceGroups(group_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_vnet_per_group UNIQUE (group_id,name),
    CONSTRAINT ck_vnets_deleted CHECK (status <> 'deleted' OR deleted_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE Subnets (
    subnet_id INT AUTO_INCREMENT PRIMARY KEY,
    vnet_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    cidr_block VARCHAR(43) NOT NULL,
    status ENUM('active','deleted') NOT NULL DEFAULT 'active',
    deleted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_subnets_vnet FOREIGN KEY (vnet_id) REFERENCES VirtualNetworks(vnet_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_subnet_per_vnet UNIQUE (vnet_id,name),
    CONSTRAINT ck_subnets_deleted CHECK (status <> 'deleted' OR deleted_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE VirtualMachines (
    vm_id INT AUTO_INCREMENT PRIMARY KEY,
    subnet_id INT NOT NULL,
    host_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    hosting_class ENUM('Economy','Business','Critical') NOT NULL,
    vcpu INT NOT NULL,
    ram_gb INT NOT NULL,
    disk_gb INT NOT NULL,
    status ENUM('stopped','running','error') NOT NULL DEFAULT 'stopped',
    hourly_price DECIMAL(16,8) NOT NULL DEFAULT 0.00,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vms_subnet FOREIGN KEY (subnet_id) REFERENCES Subnets(subnet_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_vms_host_class FOREIGN KEY (host_id,hosting_class)
        REFERENCES ProviderHosts(host_id,hosting_class) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_vm_per_subnet UNIQUE (subnet_id,name),
    CONSTRAINT uq_vm_id_host UNIQUE (vm_id,host_id),
    CONSTRAINT ck_vms_capacity CHECK (vcpu > 0 AND ram_gb > 0 AND disk_gb > 0),
    CONSTRAINT ck_vms_price CHECK (hourly_price >= 0),
    KEY idx_vms_host (host_id,hosting_class)
) ENGINE=InnoDB;

-- Optional Developer 2 simulated IP pool. Fill with test-only addresses when needed.
CREATE TABLE IF NOT EXISTS InstanceIPPool (
    ip_address VARCHAR(45) NOT NULL PRIMARY KEY,
    vm_id BIGINT NULL,
    allocated_at DATETIME NULL,
    UNIQUE KEY uq_ip_vm (vm_id)
) ENGINE=InnoDB;

CREATE TABLE LoadBalancers (
    lb_id INT AUTO_INCREMENT PRIMARY KEY,
    vnet_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    algorithm ENUM('round_robin','least_connections') NOT NULL DEFAULT 'round_robin',
    status ENUM('inactive','active') NOT NULL DEFAULT 'inactive',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lb_vnet FOREIGN KEY (vnet_id) REFERENCES VirtualNetworks(vnet_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_lb_per_vnet UNIQUE (vnet_id,name)
) ENGINE=InnoDB;

CREATE TABLE LoadBalancerTargets (
    lb_id INT NOT NULL,
    vm_id INT NOT NULL,
    PRIMARY KEY (lb_id,vm_id),
    CONSTRAINT fk_lb_targets_lb FOREIGN KEY (lb_id) REFERENCES LoadBalancers(lb_id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_lb_targets_vm FOREIGN KEY (vm_id) REFERENCES VirtualMachines(vm_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    KEY idx_lb_targets_vm (vm_id)
) ENGINE=InnoDB;

-- One VM runtime interval. Historical quantities are snapshotted on write.
-- Dev 2 uses these additional fields for billing. Dev 1 retains usage_id.
CREATE TABLE VmUsage (
    usage_id INT AUTO_INCREMENT PRIMARY KEY,
    vm_id INT NOT NULL,
    customer_id INT NOT NULL,
    provider_id INT NOT NULL,
    cloud_class ENUM('Economy','Business','Critical') NOT NULL,
    cpu_cores DECIMAL(12,2) NOT NULL,
    ram_gb DECIMAL(12,2) NOT NULL,
    gpu_units DECIMAL(12,2) NOT NULL DEFAULT 0,
    started_at DATETIME NOT NULL,
    stopped_at DATETIME NULL,
    simulated_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    provider_earning DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT fk_vm_usage_vm FOREIGN KEY (vm_id) REFERENCES VirtualMachines(vm_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_vm_usage_customer FOREIGN KEY (customer_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_vm_usage_provider FOREIGN KEY (provider_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    KEY idx_vm_usage_start (vm_id, started_at),
    CONSTRAINT ck_vm_usage_times CHECK (stopped_at IS NULL OR stopped_at >= started_at),
    CONSTRAINT ck_vm_usage_quantity CHECK (cpu_cores > 0 AND ram_gb > 0 AND gpu_units >= 0),
    CONSTRAINT ck_vm_usage_cost CHECK (simulated_cost >= 0 AND provider_earning >= 0),
    KEY idx_vm_usage_customer (customer_id,started_at),
    KEY idx_vm_usage_provider (provider_id,started_at)
) ENGINE=InnoDB;

-- ---------------------- STORAGE AND MANAGED SERVICES -------------------------
CREATE TABLE InstanceStorageUsage (
    vm_id BIGINT NOT NULL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    provider_id BIGINT NOT NULL,
    cloud_class VARCHAR(32) NOT NULL,
    quantity DECIMAL(12,3) NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME NULL,
    KEY idx_storage_customer (customer_id, started_at, ended_at)
) ENGINE=InnoDB;

CREATE TABLE BlobStorage (
    blob_id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    size_gb INT NOT NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_blob_group FOREIGN KEY (group_id) REFERENCES ResourceGroups(group_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_blob_per_group UNIQUE (group_id,name),
    CONSTRAINT uq_blob_id_group UNIQUE (blob_id,group_id),
    CONSTRAINT ck_blob_size CHECK (size_gb > 0)
) ENGINE=InnoDB;

CREATE TABLE FileStorage (
    file_id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    size_gb INT NOT NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_file_group FOREIGN KEY (group_id) REFERENCES ResourceGroups(group_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_file_per_group UNIQUE (group_id,name),
    CONSTRAINT uq_file_id_group UNIQUE (file_id,group_id),
    CONSTRAINT ck_file_size CHECK (size_gb > 0)
) ENGINE=InnoDB;

CREATE TABLE ManagedDatabases (
    database_id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    engine ENUM('SQL_SERVER','POSTGRESQL','MYSQL') NOT NULL,
    size_gb INT NOT NULL,
    status ENUM('stopped','running') NOT NULL DEFAULT 'stopped',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_db_group FOREIGN KEY (group_id) REFERENCES ResourceGroups(group_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_db_per_group UNIQUE (group_id,name),
    CONSTRAINT uq_db_id_group UNIQUE (database_id,group_id),
    CONSTRAINT ck_db_size CHECK (size_gb > 0)
) ENGINE=InnoDB;

CREATE TABLE WebApps (
    webapp_id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    database_id INT NULL,
    name VARCHAR(100) NOT NULL,
    status ENUM('stopped','running') NOT NULL DEFAULT 'stopped',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_webapp_group FOREIGN KEY (group_id) REFERENCES ResourceGroups(group_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_webapp_db_same_group FOREIGN KEY (database_id,group_id)
        REFERENCES ManagedDatabases(database_id,group_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_webapp_per_group UNIQUE (group_id,name),
    CONSTRAINT uq_webapp_id_group UNIQUE (webapp_id,group_id),
    KEY idx_webapp_db_group (database_id,group_id)
) ENGINE=InnoDB;
