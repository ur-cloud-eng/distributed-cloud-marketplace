-- ------------------------ REGISTRY AND ALLOCATIONS ---------------------------
-- ResourceGroup/VNet/Subnet are free structural objects, not registry entries.
-- All billable cloud objects have exactly one registry identity.
CREATE TABLE ResourceRegistry (
    resource_id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    customer_user_id INT NOT NULL,
    resource_type ENUM('VIRTUAL_MACHINE','LOAD_BALANCER','BLOB_STORAGE','FILE_STORAGE',
                       'SQL_SERVER','POSTGRESQL','MYSQL','WEB_APP') NOT NULL,
    vm_id INT NULL,
    lb_id INT NULL,
    blob_id INT NULL,
    file_id INT NULL,
    database_id INT NULL,
    webapp_id INT NULL,
    status ENUM('created','active','stopped','cancelled','deleted') NOT NULL DEFAULT 'created',
    activated_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    deleted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_registry_group_owner FOREIGN KEY (group_id,customer_user_id)
        REFERENCES ResourceGroups(group_id,customer_user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_vm FOREIGN KEY (vm_id) REFERENCES VirtualMachines(vm_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_lb FOREIGN KEY (lb_id) REFERENCES LoadBalancers(lb_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_blob_same_group FOREIGN KEY (blob_id,group_id)
        REFERENCES BlobStorage(blob_id,group_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_file_same_group FOREIGN KEY (file_id,group_id)
        REFERENCES FileStorage(file_id,group_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_db_same_group FOREIGN KEY (database_id,group_id)
        REFERENCES ManagedDatabases(database_id,group_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_webapp_same_group FOREIGN KEY (webapp_id,group_id)
        REFERENCES WebApps(webapp_id,group_id) ON DELETE RESTRICT,
    CONSTRAINT uq_registry_resource_owner UNIQUE (resource_id,customer_user_id),
    CONSTRAINT uq_registry_vm UNIQUE (vm_id),
    CONSTRAINT uq_registry_lb UNIQUE (lb_id),
    CONSTRAINT uq_registry_blob UNIQUE (blob_id),
    CONSTRAINT uq_registry_file UNIQUE (file_id),
    CONSTRAINT uq_registry_db UNIQUE (database_id),
    CONSTRAINT uq_registry_webapp UNIQUE (webapp_id),
    CONSTRAINT ck_registry_one_entity CHECK (
        (vm_id IS NOT NULL) + (lb_id IS NOT NULL) + (blob_id IS NOT NULL) +
        (file_id IS NOT NULL) + (database_id IS NOT NULL) + (webapp_id IS NOT NULL) = 1
    ),
    CONSTRAINT ck_registry_type CHECK (
         (resource_type='VIRTUAL_MACHINE' AND vm_id IS NOT NULL) OR
         (resource_type='LOAD_BALANCER' AND lb_id IS NOT NULL) OR
         (resource_type='BLOB_STORAGE' AND blob_id IS NOT NULL) OR
         (resource_type='FILE_STORAGE' AND file_id IS NOT NULL) OR
         (resource_type IN ('SQL_SERVER','POSTGRESQL','MYSQL') AND database_id IS NOT NULL) OR
         (resource_type='WEB_APP' AND webapp_id IS NOT NULL)
    ),
    CONSTRAINT ck_registry_cancel_time CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL),
    CONSTRAINT ck_registry_delete_time CHECK (status <> 'deleted' OR deleted_at IS NOT NULL),
    KEY idx_registry_owner_status (customer_user_id,status),
    KEY idx_registry_group_status (group_id,status)
) ENGINE=InnoDB;

CREATE TABLE HostCapacityAllocations (
    allocation_id INT AUTO_INCREMENT PRIMARY KEY,
    vm_id INT NULL,
    resource_id INT NULL,
    host_id INT NOT NULL,
    allocated_cpu INT NOT NULL,
    allocated_ram_gb INT NOT NULL,
    allocated_disk_gb INT NOT NULL,
    allocated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at DATETIME NULL,
    CONSTRAINT fk_alloc_vm_host FOREIGN KEY (vm_id,host_id)
        REFERENCES VirtualMachines(vm_id,host_id) ON DELETE RESTRICT,
    CONSTRAINT fk_alloc_host FOREIGN KEY (host_id) REFERENCES ProviderHosts(host_id)
        ON DELETE RESTRICT,
    CONSTRAINT uq_alloc_vm UNIQUE (vm_id),
    CONSTRAINT uq_alloc_resource UNIQUE (resource_id),
    CONSTRAINT fk_alloc_resource FOREIGN KEY (resource_id) REFERENCES ResourceRegistry(resource_id) ON DELETE RESTRICT,
    CONSTRAINT ck_alloc_identity CHECK ((vm_id IS NULL) <> (resource_id IS NULL)),
    CONSTRAINT ck_alloc_positive CHECK
        (allocated_cpu >= 0 AND allocated_ram_gb >= 0 AND allocated_disk_gb > 0
         AND (vm_id IS NULL OR (allocated_cpu > 0 AND allocated_ram_gb > 0))),
    CONSTRAINT ck_alloc_dates CHECK (released_at IS NULL OR released_at >= allocated_at),
    KEY idx_alloc_host_active (host_id,released_at)
) ENGINE=InnoDB;

-- Canonical non-VM usage table. Finance records explicit price units, not
-- duplicate copies in resource_usage_periods. Structural resources are free.
CREATE TABLE ResourceUsagePeriods (
    usage_period_id INT AUTO_INCREMENT PRIMARY KEY,
    resource_id INT NOT NULL,
    customer_id INT NOT NULL,
    provider_id INT NULL,
    resource_type ENUM('CPU','RAM','Storage','GPU') NOT NULL,
    cloud_class ENUM('Economy','Business','Critical') NOT NULL,
    quantity DECIMAL(12,2) NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_usage_resource FOREIGN KEY (resource_id) REFERENCES ResourceRegistry(resource_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_usage_owner FOREIGN KEY (resource_id,customer_id)
        REFERENCES ResourceRegistry(resource_id,customer_user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_usage_provider FOREIGN KEY (provider_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT uq_usage_start UNIQUE (resource_id,resource_type,started_at),
    CONSTRAINT ck_usage_quantity CHECK (quantity > 0),
    CONSTRAINT ck_usage_times CHECK (ended_at IS NULL OR ended_at >= started_at),
    KEY idx_usage_customer (customer_id,started_at),
    KEY idx_usage_resource_end (resource_id,ended_at)
) ENGINE=InnoDB;

CREATE TABLE ResourceActivityLogs (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_user_id INT NULL,
    resource_id INT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_pk INT NOT NULL,
    action VARCHAR(40) NOT NULL,
    old_status VARCHAR(30) NULL,
    new_status VARCHAR(30) NULL,
    details JSON NULL,
    occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_activity_actor FOREIGN KEY (actor_user_id) REFERENCES Users(user_id)
        ON DELETE SET NULL,
    CONSTRAINT fk_activity_registry FOREIGN KEY (resource_id) REFERENCES ResourceRegistry(resource_id)
        ON DELETE RESTRICT,
    KEY idx_activity_resource (resource_id,occurred_at),
    KEY idx_activity_actor (actor_user_id,occurred_at),
    KEY idx_activity_entity (entity_type,entity_pk)
) ENGINE=InnoDB;
