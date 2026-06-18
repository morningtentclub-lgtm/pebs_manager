-- amount 컬럼을 integer → numeric(15,4)로 변경하여 달러 소수점 지원
ALTER TABLE payments ALTER COLUMN amount TYPE NUMERIC(15,4) USING amount::numeric;
ALTER TABLE expenses ALTER COLUMN amount TYPE NUMERIC(15,4) USING amount::numeric;
