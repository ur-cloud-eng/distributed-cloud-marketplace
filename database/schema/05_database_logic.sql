-- ----------------------------- REPORTING VIEW -------------------------------
-- Stopped VMs retain capacity until cancellation (released_at is set).
CREATE VIEW vw_ProviderCapacity AS
SELECT h.host_id,h.provider_user_id,h.name,h.region,h.hosting_class,
       h.total_cpu,h.total_ram_gb,h.total_disk_gb,
       COALESCE(a.used_cpu,0) AS used_cpu,
       COALESCE(a.used_ram_gb,0) AS used_ram_gb,
       COALESCE(a.used_disk_gb,0) AS used_disk_gb,
       h.total_cpu - COALESCE(a.used_cpu,0) AS free_cpu,
       h.total_ram_gb - COALESCE(a.used_ram_gb,0) AS free_ram_gb,
       h.total_disk_gb - COALESCE(a.used_disk_gb,0) AS free_disk_gb
FROM ProviderHosts h
LEFT JOIN (
    SELECT host_id, SUM(allocated_cpu) AS used_cpu,
           SUM(allocated_ram_gb) AS used_ram_gb,
           SUM(allocated_disk_gb) AS used_disk_gb
    FROM HostCapacityAllocations
    WHERE released_at IS NULL
    GROUP BY host_id
) a ON a.host_id=h.host_id;

-- ---------------------- VALIDATION AND LIFECYCLE -----------------------------
DELIMITER $$

CREATE TRIGGER trg_host_provider_role_insert
BEFORE INSERT ON ProviderHosts FOR EACH ROW
BEGIN
    IF NOT EXISTS (SELECT 1 FROM Users u WHERE u.user_id=NEW.provider_user_id
                   AND u.role='provider' AND u.email_verified_at IS NOT NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Host owner must be a verified provider';
    END IF;
END$$

CREATE TRIGGER trg_host_provider_role_update
BEFORE UPDATE ON ProviderHosts FOR EACH ROW
BEGIN
    IF NEW.provider_user_id <> OLD.provider_user_id AND NOT EXISTS
       (SELECT 1 FROM Users u WHERE u.user_id=NEW.provider_user_id
        AND u.role='provider' AND u.email_verified_at IS NOT NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Host owner must be a verified provider';
    END IF;
    IF NEW.total_cpu < (SELECT COALESCE(SUM(allocated_cpu),0) FROM HostCapacityAllocations
                        WHERE host_id=OLD.host_id AND released_at IS NULL)
       OR NEW.total_ram_gb < (SELECT COALESCE(SUM(allocated_ram_gb),0) FROM HostCapacityAllocations
                             WHERE host_id=OLD.host_id AND released_at IS NULL)
       OR NEW.total_disk_gb < (SELECT COALESCE(SUM(allocated_disk_gb),0) FROM HostCapacityAllocations
                              WHERE host_id=OLD.host_id AND released_at IS NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Host capacity below active reservations';
    END IF;
END$$

CREATE TRIGGER trg_group_customer_role_insert
BEFORE INSERT ON ResourceGroups FOR EACH ROW
BEGIN
    IF NOT EXISTS (SELECT 1 FROM Users u WHERE u.user_id=NEW.customer_user_id
                   AND u.role='customer' AND u.email_verified_at IS NOT NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Group owner must be a verified customer';
    END IF;
END$$

CREATE TRIGGER trg_group_customer_role_update
BEFORE UPDATE ON ResourceGroups FOR EACH ROW
BEGIN
    IF NEW.customer_user_id <> OLD.customer_user_id AND NOT EXISTS
       (SELECT 1 FROM Users u WHERE u.user_id=NEW.customer_user_id
        AND u.role='customer' AND u.email_verified_at IS NOT NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Group owner must be a verified customer';
    END IF;
END$$

CREATE TRIGGER trg_lb_target_match_insert
BEFORE INSERT ON LoadBalancerTargets FOR EACH ROW
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM LoadBalancers lb
        JOIN VirtualMachines vm ON vm.vm_id=NEW.vm_id
        JOIN Subnets s ON s.subnet_id=vm.subnet_id
        JOIN VirtualNetworks n ON n.vnet_id=s.vnet_id
        JOIN ResourceGroups g ON g.group_id=n.group_id
        JOIN ResourceRegistry lr ON lr.lb_id=lb.lb_id
        JOIN ResourceRegistry vr ON vr.vm_id=vm.vm_id
        WHERE lb.lb_id=NEW.lb_id AND lb.vnet_id=s.vnet_id
          AND n.status='active' AND s.status='active' AND g.status='active'
          AND lr.status NOT IN ('cancelled','deleted')
          AND vr.status NOT IN ('cancelled','deleted')
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid LB target: networks or statuses differ';
    END IF;
END$$

CREATE TRIGGER trg_lb_target_match_update
BEFORE UPDATE ON LoadBalancerTargets FOR EACH ROW
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM LoadBalancers lb
        JOIN VirtualMachines vm ON vm.vm_id=NEW.vm_id
        JOIN Subnets s ON s.subnet_id=vm.subnet_id
        JOIN ResourceRegistry lr ON lr.lb_id=lb.lb_id
        JOIN ResourceRegistry vr ON vr.vm_id=vm.vm_id
        WHERE lb.lb_id=NEW.lb_id AND lb.vnet_id=s.vnet_id
          AND lr.status NOT IN ('cancelled','deleted')
          AND vr.status NOT IN ('cancelled','deleted')
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='LB target must belong to same VNet';
    END IF;
END$$

CREATE TRIGGER trg_registry_validate_insert
BEFORE INSERT ON ResourceRegistry FOR EACH ROW
BEGIN
    IF NEW.vm_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM VirtualMachines v JOIN Subnets s ON s.subnet_id=v.subnet_id
        JOIN VirtualNetworks n ON n.vnet_id=s.vnet_id
        WHERE v.vm_id=NEW.vm_id AND n.group_id=NEW.group_id
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Registered VM belongs to another group';
    END IF;
    IF NEW.lb_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM LoadBalancers l JOIN VirtualNetworks n ON n.vnet_id=l.vnet_id
        WHERE l.lb_id=NEW.lb_id AND n.group_id=NEW.group_id
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Registered LB belongs to another group';
    END IF;
    IF NEW.database_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ManagedDatabases d WHERE d.database_id=NEW.database_id
        AND CAST(d.engine AS CHAR)=CAST(NEW.resource_type AS CHAR)
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed DB engine/resource type mismatch';
    END IF;
END$$

CREATE TRIGGER trg_registry_validate_update
BEFORE UPDATE ON ResourceRegistry FOR EACH ROW
BEGIN
    IF NOT (NEW.group_id <=> OLD.group_id)
      OR NOT (NEW.customer_user_id <=> OLD.customer_user_id)
      OR NOT (NEW.resource_type <=> OLD.resource_type)
      OR NOT (NEW.vm_id <=> OLD.vm_id)
      OR NOT (NEW.lb_id <=> OLD.lb_id)
      OR NOT (NEW.blob_id <=> OLD.blob_id)
      OR NOT (NEW.file_id <=> OLD.file_id)
      OR NOT (NEW.database_id <=> OLD.database_id)
      OR NOT (NEW.webapp_id <=> OLD.webapp_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Resource registry identity cannot change';
    END IF;
END$$

-- VM billable intervals always derive their owner, provider and unit sizes
-- from the actual VM/subnet/host, NOT from potentially forged request values.
CREATE TRIGGER trg_vm_usage_insert
BEFORE INSERT ON VmUsage FOR EACH ROW
BEGIN
    DECLARE v_customer INT DEFAULT NULL;
    DECLARE v_provider INT DEFAULT NULL;
    DECLARE v_class VARCHAR(20) DEFAULT NULL;
    DECLARE v_cpu INT DEFAULT NULL;
    DECLARE v_ram INT DEFAULT NULL;
    SELECT g.customer_user_id,h.provider_user_id,v.hosting_class,v.vcpu,v.ram_gb
      INTO v_customer,v_provider,v_class,v_cpu,v_ram
    FROM VirtualMachines v
    JOIN ProviderHosts h ON h.host_id=v.host_id
    JOIN Subnets s ON s.subnet_id=v.subnet_id
    JOIN VirtualNetworks n ON n.vnet_id=s.vnet_id
    JOIN ResourceGroups g ON g.group_id=n.group_id
    WHERE v.vm_id=NEW.vm_id;
    IF v_customer IS NULL OR v_provider IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VM usage has no valid owner or provider';
    END IF;
    IF NEW.customer_id <> v_customer OR NEW.provider_id <> v_provider
       OR NEW.cloud_class <> v_class OR NEW.cpu_cores <> v_cpu OR NEW.ram_gb <> v_ram THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VM usage cannot disagree with its VM allocation';
    END IF;
END$$

CREATE TRIGGER trg_resource_usage_insert
BEFORE INSERT ON ResourceUsagePeriods FOR EACH ROW
BEGIN
    IF NOT EXISTS (
       SELECT 1 FROM ResourceRegistry r WHERE r.resource_id=NEW.resource_id
         AND r.customer_user_id=NEW.customer_id AND r.resource_type <> 'VIRTUAL_MACHINE'
         AND r.status NOT IN ('cancelled','deleted')
    ) THEN
       SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Usage must refer to active non-VM customer resource';
    END IF;
    IF NEW.provider_id IS NOT NULL AND NOT EXISTS
       (SELECT 1 FROM Users u WHERE u.user_id=NEW.provider_id AND u.role='provider'
        AND u.email_verified_at IS NOT NULL) THEN
       SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Usage provider must be verified';
    END IF;
END$$

-- Protected capacity reservation and VM creation; one transaction.
-- CALL sp_CreateVmWithAllocation(customer_id,subnet_id,host_id,name,class,
--                                vcpu,ram_gb,disk_gb,hourly_price,@new_vm_id);
-- Developer 1 (feature/instances): current protected VM allocation procedure.
CREATE PROCEDURE sp_CreateVmWithAllocation(
    IN p_actor_customer_id INT,
    IN p_subnet_id INT,
    IN p_host_id INT,
    IN p_name VARCHAR(100),
    IN p_hosting_class VARCHAR(20),
    IN p_vcpu INT,
    IN p_ram_gb INT,
    IN p_disk_gb INT,
    IN p_hourly_price DECIMAL(16,8),
    OUT p_new_vm_id INT
)
BEGIN
    DECLARE v_host_region VARCHAR(50);
    DECLARE v_host_class VARCHAR(20);
    DECLARE v_host_status VARCHAR(20);
    DECLARE v_provider_role VARCHAR(20);
    DECLARE v_provider_verified DATETIME;
    DECLARE v_total_cpu INT;
    DECLARE v_total_ram INT;
    DECLARE v_total_disk INT;
    DECLARE v_used_cpu BIGINT DEFAULT 0;
    DECLARE v_used_ram BIGINT DEFAULT 0;
    DECLARE v_used_disk BIGINT DEFAULT 0;
    DECLARE v_group_id INT;
    DECLARE v_customer_id INT;
    DECLARE v_group_region VARCHAR(50);
    DECLARE v_customer_role VARCHAR(20);
    DECLARE v_customer_verified DATETIME;
    DECLARE v_group_status VARCHAR(20);
    DECLARE v_vnet_status VARCHAR(20);
    DECLARE v_subnet_status VARCHAR(20);
    DECLARE v_missing BOOLEAN DEFAULT FALSE;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_missing = TRUE;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SET p_new_vm_id = NULL;
    IF p_vcpu <= 0 OR p_ram_gb <= 0 OR p_disk_gb <= 0
        OR p_hourly_price < 0 OR p_hosting_class NOT IN ('Economy','Business','Critical') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid VM specification';
    END IF;
    START TRANSACTION;
    SET v_missing = FALSE;
    SELECT h.region, h.hosting_class, h.status,
           h.total_cpu, h.total_ram_gb, h.total_disk_gb,
           u.role, u.email_verified_at
    INTO v_host_region, v_host_class, v_host_status,
         v_total_cpu, v_total_ram, v_total_disk,
         v_provider_role, v_provider_verified
    FROM ProviderHosts h JOIN Users u ON u.user_id = h.provider_user_id
    WHERE h.host_id = p_host_id FOR UPDATE;
    IF v_missing THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Provider host not found';
    END IF;
    IF v_host_status <> 'available' OR v_host_class <> p_hosting_class
        OR v_provider_role <> 'provider' OR v_provider_verified IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Host unavailable, unverified or class mismatch';
    END IF;

    SET v_missing = FALSE;
    SELECT g.group_id, g.customer_user_id, g.region,
           u.role, u.email_verified_at, g.status, n.status, s.status
    INTO v_group_id, v_customer_id, v_group_region,
         v_customer_role, v_customer_verified, v_group_status, v_vnet_status, v_subnet_status
    FROM Subnets s
    JOIN VirtualNetworks n ON n.vnet_id = s.vnet_id
    JOIN ResourceGroups g ON g.group_id = n.group_id
    JOIN Users u ON u.user_id = g.customer_user_id
    WHERE s.subnet_id = p_subnet_id FOR UPDATE;
    IF v_missing THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Subnet or resource group not found';
    END IF;
    IF p_actor_customer_id IS NULL OR v_customer_id <> p_actor_customer_id
        OR v_group_region <> v_host_region OR v_customer_role <> 'customer'
        OR v_customer_verified IS NULL
        OR v_group_status <> 'active' OR v_vnet_status <> 'active'
        OR v_subnet_status <> 'active' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Region mismatch or customer unverified';
    END IF;

    SELECT COALESCE(SUM(allocated_cpu),0),
           COALESCE(SUM(allocated_ram_gb),0),
           COALESCE(SUM(allocated_disk_gb),0)
    INTO v_used_cpu, v_used_ram, v_used_disk
    FROM HostCapacityAllocations
    WHERE host_id = p_host_id AND released_at IS NULL;
    IF v_used_cpu + p_vcpu > v_total_cpu
       OR v_used_ram + p_ram_gb > v_total_ram
       OR v_used_disk + p_disk_gb > v_total_disk THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Insufficient provider capacity';
    END IF;

    INSERT INTO VirtualMachines
        (subnet_id, host_id, name, hosting_class, vcpu, ram_gb, disk_gb, hourly_price)
    VALUES (p_subnet_id, p_host_id, p_name, p_hosting_class,
            p_vcpu, p_ram_gb, p_disk_gb, p_hourly_price);
    SET p_new_vm_id = LAST_INSERT_ID();

    INSERT INTO HostCapacityAllocations
        (vm_id, host_id, allocated_cpu, allocated_ram_gb, allocated_disk_gb)
    VALUES (p_new_vm_id, p_host_id, p_vcpu, p_ram_gb, p_disk_gb);

    INSERT INTO ResourceRegistry
        (group_id, customer_user_id, resource_type, vm_id, status)
    VALUES (v_group_id, v_customer_id, 'VIRTUAL_MACHINE', p_new_vm_id, 'stopped');

    INSERT INTO ResourceActivityLogs (actor_user_id, resource_id, entity_type, entity_pk, action, new_status)
    VALUES (p_actor_customer_id, LAST_INSERT_ID(), 'VIRTUAL_MACHINE', p_new_vm_id, 'created', 'stopped');
    -- Disk is reserved from creation until cancellation, even while stopped.
    INSERT INTO InstanceStorageUsage
        (vm_id, customer_id, provider_id, cloud_class, quantity, started_at)
    SELECT p_new_vm_id, v_customer_id, h.provider_user_id,
           p_hosting_class, p_disk_gb, UTC_TIMESTAMP()
    FROM ProviderHosts h WHERE h.host_id = p_host_id;
    COMMIT;
END$$

CREATE PROCEDURE sp_RegisterResource(
    IN p_group_id INT, IN p_customer_id INT,
    IN p_resource_type VARCHAR(30), IN p_entity_id INT,
    OUT p_new_resource_id INT
)
BEGIN
    DECLARE v_actual_group INT DEFAULT NULL;
    DECLARE v_db_engine VARCHAR(30) DEFAULT NULL;
    DECLARE v_initial_status VARCHAR(20) DEFAULT 'created';
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    SET p_new_resource_id=NULL;
    START TRANSACTION;
    IF NOT EXISTS (
        SELECT 1 FROM ResourceGroups g JOIN Users u ON u.user_id=g.customer_user_id
        WHERE g.group_id=p_group_id AND g.customer_user_id=p_customer_id
        AND g.status='active' AND u.role='customer' AND u.email_verified_at IS NOT NULL
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid resource group or customer';
    END IF;
    CASE p_resource_type
      WHEN 'LOAD_BALANCER' THEN
        SELECT MAX(n.group_id) INTO v_actual_group FROM LoadBalancers l
        JOIN VirtualNetworks n ON n.vnet_id=l.vnet_id WHERE l.lb_id=p_entity_id;
      WHEN 'BLOB_STORAGE' THEN
        SELECT MAX(group_id) INTO v_actual_group FROM BlobStorage WHERE blob_id=p_entity_id;
        SET v_initial_status='active';
      WHEN 'FILE_STORAGE' THEN
        SELECT MAX(group_id) INTO v_actual_group FROM FileStorage WHERE file_id=p_entity_id;
        SET v_initial_status='active';
      WHEN 'SQL_SERVER' THEN
        SELECT MAX(group_id), MAX(engine) INTO v_actual_group,v_db_engine
        FROM ManagedDatabases WHERE database_id=p_entity_id;
      WHEN 'POSTGRESQL' THEN
        SELECT MAX(group_id), MAX(engine) INTO v_actual_group,v_db_engine
        FROM ManagedDatabases WHERE database_id=p_entity_id;
      WHEN 'MYSQL' THEN
        SELECT MAX(group_id), MAX(engine) INTO v_actual_group,v_db_engine
        FROM ManagedDatabases WHERE database_id=p_entity_id;
      WHEN 'WEB_APP' THEN
        SELECT MAX(group_id) INTO v_actual_group FROM WebApps WHERE webapp_id=p_entity_id;
      ELSE
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid type for registration';
    END CASE;
    IF v_actual_group IS NULL OR v_actual_group <> p_group_id THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Resource not in customer group';
    END IF;
    IF p_resource_type IN ('SQL_SERVER','POSTGRESQL','MYSQL') AND
       (v_db_engine IS NULL OR v_db_engine <> p_resource_type) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Database engine mismatch';
    END IF;
    INSERT INTO ResourceRegistry
      (group_id,customer_user_id,resource_type,lb_id,blob_id,file_id,database_id,webapp_id,status,activated_at)
    VALUES(p_group_id,p_customer_id,p_resource_type,
      IF(p_resource_type='LOAD_BALANCER',p_entity_id,NULL),
      IF(p_resource_type='BLOB_STORAGE',p_entity_id,NULL),
      IF(p_resource_type='FILE_STORAGE',p_entity_id,NULL),
      IF(p_resource_type IN ('SQL_SERVER','POSTGRESQL','MYSQL'),p_entity_id,NULL),
      IF(p_resource_type='WEB_APP',p_entity_id,NULL),v_initial_status,
      IF(v_initial_status='active',UTC_TIMESTAMP(),NULL));
    SET p_new_resource_id=LAST_INSERT_ID();
    INSERT INTO ResourceActivityLogs(actor_user_id,resource_id,entity_type,entity_pk,action,new_status)
    VALUES(p_customer_id,p_new_resource_id,p_resource_type,p_entity_id,'registered',v_initial_status);
    COMMIT;
END$$

CREATE PROCEDURE sp_AddLoadBalancerTarget(IN p_lb_id INT,IN p_vm_id INT)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM LoadBalancers lb JOIN VirtualNetworks n ON n.vnet_id=lb.vnet_id
        JOIN ResourceGroups g ON g.group_id=n.group_id
        JOIN VirtualMachines vm ON vm.vm_id=p_vm_id
        JOIN Subnets s ON s.subnet_id=vm.subnet_id
        JOIN ResourceRegistry lr ON lr.lb_id=lb.lb_id
        JOIN ResourceRegistry vr ON vr.vm_id=vm.vm_id
        WHERE lb.lb_id=p_lb_id AND lb.vnet_id=s.vnet_id
          AND g.status='active' AND n.status='active' AND s.status='active'
          AND lr.status NOT IN ('cancelled','deleted')
          AND vr.status NOT IN ('cancelled','deleted')
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='LB and VM must be active in same VNet';
    END IF;
    INSERT INTO LoadBalancerTargets(lb_id,vm_id)
    VALUES(p_lb_id,p_vm_id) ON DUPLICATE KEY UPDATE lb_id=lb_id;
END$$

CREATE PROCEDURE sp_CancelResource(IN p_resource_id INT,IN p_actor_user_id INT)
BEGIN
    DECLARE v_customer_id INT DEFAULT NULL;
    DECLARE v_type VARCHAR(30) DEFAULT NULL;
    DECLARE v_status VARCHAR(20) DEFAULT NULL;
    DECLARE v_vm_id INT DEFAULT NULL;
    DECLARE v_lb_id INT DEFAULT NULL;
    DECLARE v_blob_id INT DEFAULT NULL;
    DECLARE v_file_id INT DEFAULT NULL;
    DECLARE v_db_id INT DEFAULT NULL;
    DECLARE v_webapp_id INT DEFAULT NULL;
    DECLARE v_actor_role VARCHAR(20) DEFAULT NULL;
    DECLARE v_host_id INT DEFAULT NULL;
    DECLARE v_now DATETIME;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    SET v_now=UTC_TIMESTAMP();
    START TRANSACTION;
    SELECT role INTO v_actor_role FROM Users WHERE user_id=p_actor_user_id FOR UPDATE;
    SELECT customer_user_id,resource_type,status,vm_id,lb_id,blob_id,file_id,database_id,webapp_id
      INTO v_customer_id,v_type,v_status,v_vm_id,v_lb_id,v_blob_id,v_file_id,v_db_id,v_webapp_id
    FROM ResourceRegistry WHERE resource_id=p_resource_id FOR UPDATE;
    IF v_customer_id IS NULL OR v_actor_role IS NULL
       OR (v_actor_role<>'admin' AND p_actor_user_id<>v_customer_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Resource not found or actor unauthorized';
    END IF;
    IF v_status IN ('cancelled','deleted') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Resource already cancelled';
    END IF;
    IF v_vm_id IS NOT NULL AND EXISTS
       (SELECT 1 FROM LoadBalancerTargets WHERE vm_id=v_vm_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Remove VM from load balancers first';
    END IF;
    IF v_db_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM WebApps w JOIN ResourceRegistry r ON r.webapp_id=w.webapp_id
        WHERE w.database_id=v_db_id AND r.status NOT IN ('cancelled','deleted')
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancel dependent Web Apps first';
    END IF;
    IF v_vm_id IS NOT NULL THEN
        SELECT host_id INTO v_host_id FROM VirtualMachines WHERE vm_id=v_vm_id;
        -- Serialize with creation and other host capacity changes.
        SELECT host_id INTO v_host_id FROM ProviderHosts WHERE host_id=v_host_id FOR UPDATE;
        SET v_now=UTC_TIMESTAMP();
        UPDATE VmUsage SET stopped_at=v_now WHERE vm_id=v_vm_id AND stopped_at IS NULL;
        UPDATE InstanceStorageUsage SET ended_at=v_now
          WHERE vm_id=v_vm_id AND ended_at IS NULL;
        UPDATE HostCapacityAllocations SET released_at=v_now
          WHERE vm_id=v_vm_id AND released_at IS NULL;
        UPDATE InstanceIPPool SET vm_id=NULL, allocated_at=NULL WHERE vm_id=v_vm_id;
        UPDATE VirtualMachines SET status='stopped' WHERE vm_id=v_vm_id;
    END IF;
    IF v_vm_id IS NULL THEN
        SELECT MAX(host_id) INTO v_host_id FROM HostCapacityAllocations WHERE resource_id=p_resource_id;
        IF v_host_id IS NOT NULL THEN
            SELECT host_id INTO v_host_id FROM ProviderHosts WHERE host_id=v_host_id FOR UPDATE;
            UPDATE HostCapacityAllocations SET released_at=v_now
              WHERE resource_id=p_resource_id AND released_at IS NULL;
        END IF;
    END IF;
    IF v_lb_id IS NOT NULL THEN
        DELETE FROM LoadBalancerTargets WHERE lb_id=v_lb_id;
        UPDATE LoadBalancers SET status='inactive' WHERE lb_id=v_lb_id;
    END IF;
    IF v_blob_id IS NOT NULL THEN
        UPDATE BlobStorage SET status='inactive' WHERE blob_id=v_blob_id;
    END IF;
    IF v_file_id IS NOT NULL THEN
        UPDATE FileStorage SET status='inactive' WHERE file_id=v_file_id;
    END IF;
    IF v_db_id IS NOT NULL THEN
        UPDATE ManagedDatabases SET status='stopped' WHERE database_id=v_db_id;
    END IF;
    IF v_webapp_id IS NOT NULL THEN
        UPDATE WebApps SET status='stopped' WHERE webapp_id=v_webapp_id;
    END IF;
    UPDATE ResourceUsagePeriods SET ended_at=v_now
      WHERE resource_id=p_resource_id AND ended_at IS NULL;
    UPDATE ResourceRegistry SET status='cancelled',cancelled_at=v_now
      WHERE resource_id=p_resource_id;
    INSERT INTO ResourceActivityLogs(actor_user_id,resource_id,entity_type,entity_pk,
                                     action,old_status,new_status)
    VALUES(p_actor_user_id,p_resource_id,v_type,
           COALESCE(v_vm_id,v_lb_id,v_blob_id,v_file_id,v_db_id,v_webapp_id),
           'cancelled',v_status,'cancelled');
    COMMIT;
END$$

DELIMITER ;
