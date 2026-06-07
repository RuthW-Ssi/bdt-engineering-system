import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { useActivity, useCreateActivity, useUpdateActivity } from '../hooks/useActivities'

interface FormValues {
  name: string
  machine_id: number
  duration_min: number
  consumes: string // comma-separated material IDs for v1
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #E0E0E0',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  color: '#9E9E9E',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
}

export function ActivityBuilder() {
  const { id } = useParams<{ id?: string }>()
  const activityId = id ? Number(id) : undefined
  const isEdit = activityId !== undefined
  const navigate = useNavigate()

  const { data: existing } = useActivity(activityId)
  const createMutation = useCreateActivity()
  const updateMutation = useUpdateActivity(activityId ?? 0)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { name: '', machine_id: 0, duration_min: 0, consumes: '' },
  })

  useEffect(() => {
    if (existing) {
      reset({
        name: existing.name,
        machine_id: existing.machine.id,
        duration_min: Number(existing.duration_min),
        consumes: existing.consumes.map((c) => c.material.id).join(', '),
      })
    }
  }, [existing, reset])

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      machine_id: Number(values.machine_id),
      duration_min: Number(values.duration_min),
      consumes: values.consumes
        ? values.consumes.split(',').map((s) => Number(s.trim())).filter(Boolean)
        : [],
    }
    if (isEdit) {
      await updateMutation.mutateAsync(payload)
    } else {
      await createMutation.mutateAsync(payload)
    }
    navigate('/activity-library')
  }

  const error = createMutation.error || updateMutation.error

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'inherit', background: '#F8F8F8' }}>

      {/* Top bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0E0E0', height: 56, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button
          onClick={() => navigate('/activity-library')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#555', fontSize: 13 }}
        >
          <ArrowLeft size={16} />Activity Library
        </button>
        <div style={{ width: 1, height: 20, background: '#E0E0E0' }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F' }}>
          {isEdit ? 'Edit Activity' : 'New Activity'}
        </span>
      </div>

      {/* Form body */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: 32 }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          <form onSubmit={handleSubmit(onSubmit)}>

            {/* Identity card */}
            <div style={{ background: '#fff', border: '1px solid #E8E8E8', borderRadius: 10, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid #F0F0F0' }}>
                Activity Details
              </div>

              {/* Name */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>
                  ชื่อกิจกรรม <span style={{ color: '#C8202A' }}>*</span>
                </label>
                <input
                  {...register('name', { required: 'Required', maxLength: { value: 120, message: 'Max 120 chars' } })}
                  style={{ ...inputStyle, borderColor: errors.name ? '#FFCDD2' : '#E0E0E0' }}
                  placeholder="e.g. Cut H-beam web plate"
                />
                {errors.name && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#C8202A', marginTop: 4 }}>
                    <AlertCircle size={11} />{errors.name.message}
                  </div>
                )}
              </div>

              {/* Machine ID + Duration (side by side) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>
                    Machine ID <span style={{ color: '#C8202A' }}>*</span>
                  </label>
                  <input
                    {...register('machine_id', { required: 'Required', min: { value: 1, message: 'Must be ≥ 1' } })}
                    type="number"
                    style={{ ...inputStyle, borderColor: errors.machine_id ? '#FFCDD2' : '#E0E0E0' }}
                    placeholder="equipment_resource.id"
                  />
                  {errors.machine_id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#C8202A', marginTop: 4 }}>
                      <AlertCircle size={11} />{errors.machine_id.message}
                    </div>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>
                    Duration (min) <span style={{ color: '#C8202A' }}>*</span>
                  </label>
                  <input
                    {...register('duration_min', { required: 'Required', min: { value: 0, message: 'Must be ≥ 0' } })}
                    type="number"
                    step="0.01"
                    style={{ ...inputStyle, borderColor: errors.duration_min ? '#FFCDD2' : '#E0E0E0' }}
                    placeholder="5.5"
                  />
                  {errors.duration_min && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#C8202A', marginTop: 4 }}>
                      <AlertCircle size={11} />{errors.duration_min.message}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Consumables card */}
            <div style={{ background: '#fff', border: '1px solid #E8E8E8', borderRadius: 10, padding: 24, marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#9E9E9E', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid #F0F0F0' }}>
                Consumed Materials (optional)
              </div>
              <div>
                <label style={labelStyle}>Material IDs (comma-separated)</label>
                <input
                  {...register('consumes')}
                  style={inputStyle}
                  placeholder="12, 34"
                />
                <div style={{ fontSize: 11, color: '#9E9E9E', marginTop: 4 }}>
                  Enter material IDs separated by commas, e.g. 12, 34
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  height: 38, padding: '0 20px', borderRadius: 6, border: 'none',
                  background: isSubmitting ? '#E0E0E0' : '#C8202A',
                  color: isSubmitting ? '#9E9E9E' : '#fff',
                  fontSize: 13, fontWeight: 600,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/activity-library')}
                style={{ height: 38, padding: '0 20px', borderRadius: 6, border: '1px solid #E0E0E0', background: '#fff', fontSize: 13, color: '#555', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#C8202A', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={14} />
          {error instanceof Error ? error.message : 'Save failed'}
        </div>
      )}
    </div>
  )
}
