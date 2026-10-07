//! Application-owned parser launcher. It never receives repository paths.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
mod windows {
    use std::{
        ffi::c_void,
        io::{self, Read, Write},
        os::windows::{io::AsRawHandle, process::CommandExt},
        process::{Command, Stdio},
        ptr,
    };
    type Handle = *mut c_void;
    #[repr(C)]
    #[derive(Default)]
    struct Basic {
        process_time: i64,
        job_time: i64,
        flags: u32,
        min_working: usize,
        max_working: usize,
        active: u32,
        affinity: usize,
        priority: u32,
        scheduling: u32,
    }
    #[repr(C)]
    #[derive(Default)]
    struct Io {
        counters: [u64; 6],
    }
    #[repr(C)]
    #[derive(Default)]
    struct Extended {
        basic: Basic,
        io: Io,
        process_memory: usize,
        job_memory: usize,
        peak_process: usize,
        peak_job: usize,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn CreateJobObjectW(attributes: Handle, name: *const u16) -> Handle;
        fn SetInformationJobObject(job: Handle, class: u32, info: *const c_void, size: u32) -> i32;
        fn AssignProcessToJobObject(job: Handle, process: Handle) -> i32;
        fn QueryInformationJobObject(
            job: Handle,
            class: u32,
            info: *mut c_void,
            size: u32,
            returned: *mut u32,
        ) -> i32;
        fn CloseHandle(handle: Handle) -> i32;
    }
    struct Job(Handle);
    impl Drop for Job {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    fn assign(job: Handle, child: &mut std::process::Child) -> Result<(), String> {
        if unsafe { AssignProcessToJobObject(job, child.as_raw_handle() as Handle) } == 0 {
            let _ = child.kill();
            let _ = child.wait();
            return Err("parser-unavailable".into());
        }
        Ok(())
    }
    pub fn run() -> Result<(), String> {
        let args: Vec<_> = std::env::args_os().skip(1).collect();
        if args.len() != 2
            || !std::path::Path::new(&args[0]).is_absolute()
            || !std::path::Path::new(&args[1]).is_absolute()
        {
            return Err("parser-unavailable".into());
        }
        let job = Job(unsafe { CreateJobObjectW(ptr::null_mut(), ptr::null()) });
        if job.0.is_null() {
            return Err("parser-unavailable".into());
        }
        let mut limits = Extended::default();
        limits.basic.flags = 0x2000 | 0x100; // kill on close; process commit limit
        limits.process_memory = 512 * 1024 * 1024;
        if unsafe {
            SetInformationJobObject(
                job.0,
                9,
                &limits as *const _ as *const c_void,
                std::mem::size_of::<Extended>() as u32,
            )
        } == 0
        {
            return Err("parser-unavailable".into());
        }
        let mut command = Command::new(&args[0]);
        command
            .args([
                "--max-old-space-size=128",
                "--wasm-num-compilation-tasks=1",
                "--no-wasm-tier-up",
                "--no-wasm-dynamic-tiering",
                "--disable-warning=ExperimentalWarning",
            ])
            .arg(&args[1])
            .env_clear()
            .env(
                "SystemRoot",
                std::env::var_os("SystemRoot").ok_or("parser-unavailable")?,
            )
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .creation_flags(0x08000000);
        let mut child = command.spawn().map_err(|_| "parser-unavailable")?;
        assign(job.0, &mut child)?;
        let mut input = child.stdin.take().ok_or("parser-unavailable")?;
        // Worker bootstrap cannot load WASM or accept source before this gate.
        input
            .write_all(b"FS05-JOB-ASSIGNED\n")
            .map_err(|_| "parser-unavailable")?;
        std::thread::spawn(move || {
            let mut source = io::stdin().lock();
            let mut buffer = [0u8; 8192];
            loop {
                match source.read(&mut buffer) {
                    Ok(0) | Err(_) => std::process::exit(2),
                    Ok(n) => {
                        if input.write_all(&buffer[..n]).is_err() {
                            std::process::exit(2);
                        }
                    }
                }
            }
        });
        let mut output = child.stdout.take().ok_or("parser-unavailable")?;
        io::copy(&mut output, &mut io::stdout().lock()).map_err(|_| "parser-unavailable")?;
        let status = child.wait().map_err(|_| "parser-unavailable")?;
        let mut measured = Extended::default();
        if unsafe {
            QueryInformationJobObject(
                job.0,
                9,
                &mut measured as *mut _ as *mut c_void,
                std::mem::size_of::<Extended>() as u32,
                ptr::null_mut(),
            )
        } != 0
        {
            eprintln!(
                "{{\"memoryLimitBytes\":536870912,\"peakCommitBytes\":{}}}",
                measured.peak_process
            );
        }
        if !status.success() {
            return Err("resource-limit".into());
        }
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn windows_job_layout_and_fail_closed_assignment() {
            assert_eq!(std::mem::size_of::<Extended>(), 144);
            let job = Job(unsafe { CreateJobObjectW(ptr::null_mut(), ptr::null()) });
            assert!(!job.0.is_null());
            assert_eq!(
                unsafe { AssignProcessToJobObject(job.0, ptr::null_mut()) },
                0
            );
        }
        #[test]
        fn failed_assignment_reaps_child_before_bootstrap_gate() {
            let node = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("binaries/code-engine-x86_64-pc-windows-msvc.exe");
            let mut child = Command::new(node)
                .args(["-e", "process.stdin.once('data',()=>process.stdout.write('WORK_RELEASED'));setInterval(()=>{},1000)"])
                .env_clear()
                .env("SystemRoot", std::env::var_os("SystemRoot").unwrap())
                .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
                .creation_flags(0x08000000).spawn().unwrap();
            assert_eq!(
                assign(ptr::null_mut(), &mut child),
                Err("parser-unavailable".into())
            );
            assert!(child.try_wait().unwrap().is_some());
            let mut output = String::new();
            child
                .stdout
                .take()
                .unwrap()
                .read_to_string(&mut output)
                .unwrap();
            assert!(output.is_empty());
        }
    }
}

fn main() {
    #[cfg(windows)]
    if let Err(reason) = windows::run() {
        eprintln!("{reason}");
        std::process::exit(2);
    }
    #[cfg(not(windows))]
    {
        eprintln!("parser-unavailable: Windows containment required");
        std::process::exit(2);
    }
}
