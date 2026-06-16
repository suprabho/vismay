from concurrent.futures import ThreadPoolExecutor

def job():
    raise ValueError("Hidden Error")

with ThreadPoolExecutor(max_workers=1) as pool:
    future = pool.submit(job)

print("Done")
